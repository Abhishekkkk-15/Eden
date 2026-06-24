import { z } from "zod";

export const HealthCheckResponse = z.object({
  status: z.string(),
});

const blockType = z.enum([
  "text",
  "heading1",
  "heading2",
  "heading3",
  "todo",
  "bulleted",
  "numbered",
  "quote",
  "code",
  "divider",
]);

const sourceKind = z.enum(["text", "url", "youtube", "image", "video", "audio"]);

const chatContextItem = z.object({
  type: z.enum(["source", "page", "folder"]),
  id: z.number(),
  title: z.string().optional(),
});

export const CreatePageBody = z.object({
  kind: z.enum(["page", "folder"]).optional(),
  title: z.string(),
  emoji: z.string().nullish(),
  parentId: z.number().nullish(),
});

export const GetPageParams = z.object({
  id: z.coerce.number(),
});

export const UpdatePageParams = z.object({
  id: z.coerce.number(),
});

export const UpdatePageBody = z.object({
  kind: z.enum(["page", "folder"]).optional(),
  title: z.string().optional(),
  emoji: z.string().nullish(),
  parentId: z.number().nullish(),
  position: z.number().optional(),
});

export const DeletePageParams = z.object({
  id: z.coerce.number(),
});

export const CreateBlockParams = z.object({
  id: z.coerce.number(),
});

export const CreateBlockBody = z.object({
  type: blockType,
  content: z.string(),
  checked: z.boolean().optional(),
  position: z.number().optional(),
});

export const UpdateBlockParams = z.object({
  id: z.coerce.number(),
});

export const UpdateBlockBody = z.object({
  type: blockType.optional(),
  content: z.string().optional(),
  checked: z.boolean().optional(),
  position: z.number().optional(),
});

export const DeleteBlockParams = z.object({
  id: z.coerce.number(),
});

export const ReorderBlocksParams = z.object({
  id: z.coerce.number(),
});

export const ReorderBlocksBody = z.object({
  orderedIds: z.array(z.number()),
});

export const CreateSourceBody = z.object({
  kind: sourceKind,
  title: z.string(),
  content: z.string().nullish(),
  url: z.string().nullish(),
  parentPageId: z.number().nullish(),
  fileDataUrl: z.string().nullish(),
  originalFilename: z.string().nullish(),
  mediaMimeType: z.string().nullish(),
});

export const GetSourceParams = z.object({
  id: z.coerce.number(),
});

export const UpdateSourceParams = z.object({
  id: z.coerce.number(),
});

export const UpdateSourceBody = z.object({
  title: z.string().optional(),
  parentPageId: z.number().nullish(),
});

export const DeleteSourceParams = z.object({
  id: z.coerce.number(),
});

export const SearchWorkspaceQueryParams = z.object({
  q: z.coerce.string(),
});

export const CreateConversationBody = z.object({
  title: z.string(),
  agentId: z.number().nullish(),
});

export const GetConversationParams = z.object({
  id: z.coerce.number(),
});

export const DeleteConversationParams = z.object({
  id: z.coerce.number(),
});

export const SendMessageParams = z.object({
  id: z.coerce.number(),
});

export const SendMessageBody = z.object({
  content: z.string(),
  chatMode: z.enum(["default", "repurpose"]).optional(),
  contextItems: z.array(chatContextItem).optional(),
});

export const CreateAgentBody = z.object({
  name: z.string(),
  description: z.string(),
  emoji: z.string(),
  prompt: z.string(),
});

export const UpdateAgentParams = z.object({
  id: z.coerce.number(),
});

export const UpdateAgentBody = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  emoji: z.string().optional(),
  prompt: z.string().optional(),
});

export const DeleteAgentParams = z.object({
  id: z.coerce.number(),
});

export const RunAgentParams = z.object({
  id: z.coerce.number(),
});

export const RunAgentBody = z.object({
  input: z.string(),
  useWorkspaceContext: z.boolean().optional(),
});
