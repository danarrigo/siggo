import { z } from "zod";

export const assistantQuestionLimit = 800;
export const assistantDailyLimit = 20;
export const assistantCooldownSeconds = 15;

const messageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(2000),
  })
  .strict()
  .refine((message) => message.role !== "user" || message.content.length <= assistantQuestionLimit);
export const assistantRequestSchema = z
  .object({
    messages: z.array(messageSchema).min(1).max(5),
    competitionId: z.string().trim().min(1).max(250).optional(),
  })
  .strict()
  .refine(
    ({ messages }) =>
      messages.length > 0 &&
      messages[0].role === "user" &&
      messages.every((message, index) => message.role === (index % 2 ? "assistant" : "user")) &&
      messages.at(-1)?.role === "user" &&
      messages.reduce((size, message) => size + message.content.length, 0) <= 7000,
  );
export type AssistantRequest = z.infer<typeof assistantRequestSchema>;
export type AssistantMessage = AssistantRequest["messages"][number];

const sourceUrl = z
  .url({ protocol: /^https$/ })
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return !url.username && !url.password;
    } catch {
      return false;
    }
  });
export const assistantReplySchema = z.object({
  answer: z.string().trim().min(1).max(2000),
  sources: z
    .array(
      z.object({
        number: z.number().int().min(1).max(8),
        title: z.string().min(1).max(500),
        url: sourceUrl,
        metadataSource: z.object({ name: z.string().max(100), url: sourceUrl }).optional(),
      }),
    )
    .max(8),
  catalogUpdatedAt: z.iso.datetime({ offset: true }),
  selectedCount: z.number().int().min(0).max(8),
  catalogCount: z.number().int().min(0),
});
export type AssistantReply = z.infer<typeof assistantReplySchema>;
