import { 
  db, 
  cloudIntegrationsTable, 
  sourcesTable, 
  sourceChunksTable 
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { generateEmbedding, completeText } from "./ai";

const POLL_INTERVAL = 30000; // Poll every 30 seconds

async function processNotionResearch(integration: any) {
  const accessToken = integration.accessToken;
  
  try {
    // 1. Search for databases named "Eden Research"
    const searchRes = await fetch("https://api.notion.com/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: "Eden Research",
        filter: { property: "object", value: "database" }
      }),
    });

    if (!searchRes.ok) return;
    const searchData = await searchRes.json();
    const databases = (searchData as any).results;

    for (const dbInfo of databases) {
      console.log(`[NotionAgent] Checking database: ${dbInfo.title?.[0]?.plain_text || "Untitled"} (${dbInfo.id})`);
      
      // 2. Query the database for ALL items (we'll filter in JS to be safe)
      const queryRes = await fetch(`https://api.notion.com/v1/databases/${dbInfo.id}/query`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}), // No filter - get everything
      });

      if (!queryRes.ok) {
        const errText = await queryRes.text();
        console.error(`[NotionAgent] Failed to query database ${dbInfo.id}:`, errText);
        continue;
      }
      
      const queryData = await queryRes.json();
      const items = (queryData as any).results;
      
      console.log(`[NotionAgent] Total items found in database: ${items.length}`);

      for (const item of items) {
        const props = item.properties;
        const topic = props.Name?.title?.[0]?.plain_text || 
                      props.Topic?.title?.[0]?.plain_text || 
                      props.Title?.title?.[0]?.plain_text;

        if (!topic) continue;

        const statusObj = props.Status;
        const statusValue = statusObj?.status?.name || statusObj?.select?.name || "None";
        const hasReport = props["Eden Report"]?.rich_text?.length > 0;

        console.log(`[NotionAgent] - Row: "${topic}", Status: ${statusValue}, Type: ${statusObj?.type}, HasReport: ${hasReport}`);

        if (hasReport) continue; // Already processed
        
        // Filter in JS: Process if status is "Pending", "Analyzing...", "Not started", or empty
        const shouldProcess = ["Pending", "Analyzing...", "Not started", "None"].includes(statusValue) || !statusValue;
        
        if (!shouldProcess) continue;

        console.log(`[NotionAgent] >>> Starting research for: "${topic}" for user ${integration.userId}`);

        // 3. Mark as "Researching" in Notion
        const statusType = statusObj?.type || "select";
        const analyzingUpdate = statusType === "status" 
          ? { status: { name: "Analyzing..." } } 
          : { select: { name: "Analyzing..." } };

        await fetch(`https://api.notion.com/v1/pages/${item.id}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            properties: {
              Status: analyzingUpdate
            }
          }),
        });

        // 4. Perform Semantic Search in Eden
        const embedding = await generateEmbedding(topic);
        const vectorStr = `[${embedding.join(",")}]`;
        
        // Find top 8 relevant chunks
        const relevantChunks = await db.execute(sql`
          SELECT sc.content, s.title, s.kind
          FROM source_chunks sc
          JOIN sources s ON sc.source_id = s.id
          WHERE s.user_id = ${integration.userId}
          ORDER BY sc.embedding <=> ${vectorStr}::vector
          LIMIT 8
        `);

        const context = (relevantChunks.rows as any).map((c: any) => 
          `[Source: ${c.title} (${c.kind})]\n${c.content}`
        ).join("\n\n---\n\n");

        // 5. Generate Report
        const report = await completeText({
          system: "You are the Eden Research Agent. Your goal is to provide a concise but comprehensive research report based ON THE PROVIDED CONTEXT ONLY. If no relevant info is found, say so. Format the report in clean Markdown.",
          user: `Topic: ${topic}\n\nRelevant context from user's library:\n\n${context}`
        });

        // 6. Write back to Notion
        const doneUpdate = statusType === "status" 
          ? { status: { name: "Done" } } 
          : { select: { name: "Done" } };

        await fetch(`https://api.notion.com/v1/pages/${item.id}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            properties: {
              Status: doneUpdate,
              "Eden Report": {
                rich_text: [
                  { text: { content: report.slice(0, 2000) } }
                ]
              }
            }
          }),
        });
        
        // If report is long, we might want to add a comment or children blocks, 
        // but for now, we'll use a property called "Eden Report".
        
        console.log(`[NotionAgent] ✓ Completed research for "${topic}"`);
      }
    }
  } catch (err) {
    console.error(`[NotionAgent] Error processing integration ${integration.id}:`, err);
  }
}

export async function generateMeetingMinutes(userId: string, sourceTitle: string, transcription: string) {
  console.log(`[NotionAgent] Incoming Meeting Minutes request: User=${userId}, Source="${sourceTitle}", TranscriptionLength=${transcription.length}`);
  try {
    // 1. Get active Notion integration
    const [integration] = await db
      .select()
      .from(cloudIntegrationsTable)
      .where(
        and(
          eq(cloudIntegrationsTable.userId, userId),
          eq(cloudIntegrationsTable.provider, "notion"),
          eq(cloudIntegrationsTable.isActive, true)
        )
      )
      .limit(1);

    if (!integration) {
      console.log(`[NotionAgent] ❌ No active Notion integration found for user ${userId}. Checking all integrations for this user...`);
      const all = await db.select().from(cloudIntegrationsTable).where(eq(cloudIntegrationsTable.userId, userId));
      console.log(`[NotionAgent] Found ${all.length} total integrations for user:`, all.map(i => `${i.provider} (active=${i.isActive})`));
      return;
    }

    const syncSettings = integration.syncSettings as any;
    console.log(`[NotionAgent] Integration found. autoSyncMeetingMinutes state:`, syncSettings?.autoSyncMeetingMinutes);
    
    if (!syncSettings?.autoSyncMeetingMinutes) {
      console.log(`[NotionAgent] ⏭️ Auto-minutes disabled for user ${userId}, skipping.`);
      return;
    }

    const accessToken = integration.accessToken;

    // 2. Generate Summary using AI
    console.log(`[NotionAgent] Generating meeting minutes for: ${sourceTitle}`);
    const minutes = await completeText({
      system: "You are a professional secretary. Summarize the following meeting transcript into clear minutes including: 1. Overview, 2. Key Discussion Points, 3. Action Items. Format in clean Markdown.",
      user: `Transcript of "${sourceTitle}":\n\n${transcription.slice(0, 30000)}`
    });

    // 3. Find or Create "Meeting Notes" database
    console.log(`[NotionAgent] Searching for "Meeting Notes" database...`);
    const searchRes = await fetch("https://api.notion.com/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: "Meeting Notes",
        filter: { property: "object", value: "database" }
      }),
    });

    const searchResult = await searchRes.json();
    let dbInfo = searchResult.results?.[0];

    if (!dbInfo) {
      console.log(`[NotionAgent] "Meeting Notes" database not found. Creating a new one...`);
      // ... (Rest of creation logic stays same for now, but we search for parent page)
      const pageSearch = await fetch("https://api.notion.com/v1/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ filter: { property: "object", value: "page" }, page_size: 1 }),
      });
      const pageSearchResult = await pageSearch.json();
      const parentPage = pageSearchResult.results?.[0];

      if (parentPage) {
        const createRes = await fetch("https://api.notion.com/v1/databases", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            parent: { type: "page_id", page_id: parentPage.id },
            title: [{ type: "text", text: { content: "Meeting Notes" } }],
            properties: {
              Name: { title: {} },
              Date: { date: {} }
            }
          }),
        });
        dbInfo = await createRes.json();
      }
    }

    if (!dbInfo) throw new Error("Could not find or create a Notion database for meeting notes.");

    const dbUrl = dbInfo.url || `https://www.notion.so/${dbInfo.id.replace(/-/g, "")}`;
    console.log(`[NotionAgent] Using database: ${dbInfo.title?.[0]?.plain_text || "Meeting Notes"} (${dbUrl})`);

    // 4. Detect Database Properties for Mapping
    const properties = dbInfo.properties || {};
    const propertyMap: Record<string, any> = {};

    // Find title property
    const titleProp = Object.keys(properties).find(k => properties[k].type === "title") || "Name";
    propertyMap[titleProp] = { title: [{ type: "text", text: { content: `Minutes: ${sourceTitle}` } }] };

    const dateProp = Object.keys(properties).find(k => properties[k].type === "date");
    if (dateProp) {
      propertyMap[dateProp] = { date: { start: new Date().toISOString().split("T")[0] } };
    }

    // Find Summary/Notes property
    const summaryProp = Object.keys(properties).find(k => 
      (k.toLowerCase().includes("summary") || k.toLowerCase().includes("notes")) && 
      (properties[k].type === "rich_text" || properties[k].type === "text")
    );
    if (summaryProp) {
      console.log(`[NotionAgent] Found summary property: "${summaryProp}"`);
      propertyMap[summaryProp] = { rich_text: [{ type: "text", text: { content: minutes.slice(0, 1990) } }] };
    }

    // 5. Create the Page in Notion
    console.log(`[NotionAgent] Syncing to Notion...`);
    const pageRes = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        parent: { database_id: dbInfo.id },
        properties: propertyMap,
        children: [
          {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [{ type: "text", text: { content: minutes.slice(0, 1990) } }]
            }
          },
          {
            object: "block",
            type: "divider",
            divider: {}
          },
          {
            object: "block",
            type: "heading_3",
            heading_3: { rich_text: [{ type: "text", text: { content: "Original Transcription" } }] }
          },
          {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [{ type: "text", text: { content: transcription.slice(0, 1990) + "..." } }]
            }
          }
        ]
      }),
    });

    if (!pageRes.ok) {
      const errorData = await pageRes.json();
      console.error(`[NotionAgent] ❌ Notion Page Creation Failed:`, JSON.stringify(errorData, null, 2));
      throw new Error(`Notion API error: ${errorData.message || "Unknown error"}`);
    }

    console.log(`[NotionAgent] ✓ Meeting minutes successfully synced to Notion for "${sourceTitle}"`);
  } catch (err) {
    console.error("[NotionAgent] ❌ Failed to automate meeting minutes:", err);
  }
}

async function pollNotion() {
  console.log(`[NotionAgent] Heartbeat: Checking for research tasks at ${new Date().toLocaleTimeString()}`);
  try {
    const integrations = await db
      .select()
      .from(cloudIntegrationsTable)
      .where(
        and(
          eq(cloudIntegrationsTable.provider, "notion"),
          eq(cloudIntegrationsTable.isActive, true)
        )
      );

    for (const integration of integrations) {
      await processNotionResearch(integration);
    }
  } catch (err) {
    console.error("[NotionAgent] Error polling Notion:", err);
  }
}

export function startNotionAgent() {
  console.log("[NotionAgent] Starting autonomous research agent...");
  const interval = setInterval(pollNotion, POLL_INTERVAL);
  void pollNotion();
  
  return () => {
    clearInterval(interval);
    console.log("[NotionAgent] Stopped autonomous research agent");
  };
}
