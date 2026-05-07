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
