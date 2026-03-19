import OpenAI from "openai";
import { config } from "../config.js";
import { decrypt } from "../lib/encryption.js";
import { prisma } from "../lib/prisma.js";

export async function generateEmbedding(
  tenantId: string,
  text: string
): Promise<number[] | null> {
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId },
  });

  const apiKey = settings?.openaiApiKey
    ? decrypt(settings.openaiApiKey)
    : config.OPENAI_API_KEY;

  if (!apiKey) return null;

  try {
    const openai = new OpenAI({ apiKey });
    
    // We use OpenAI's newer and cheaper text-embedding-3-small
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text.replace(/\n/g, " "), // recommended to strip newlines
    });

    return response.data[0]?.embedding;
  } catch (err) {
    console.error("Failed to generate embedding:", err);
    return null;
  }
}
