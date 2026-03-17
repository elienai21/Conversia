import { z } from "zod";

export const createKBEntrySchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  category: z
    .enum(["rooms", "menu", "policies", "services", "faq", "other"])
    .default("other"),
  is_active: z.boolean().default(true),
});

export const updateKBEntrySchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).optional(),
  category: z
    .enum(["rooms", "menu", "policies", "services", "faq", "other"])
    .optional(),
  is_active: z.boolean().optional(),
});
