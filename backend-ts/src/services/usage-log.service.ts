import { prisma } from "../lib/prisma.js";

const PRICING: Record<string, { input: number; output: number }> = {
  "gpt-3.5-turbo": { input: 0.0005, output: 0.0015 },
  "gpt-4.1-mini": { input: 0.0004, output: 0.0016 },
};

export async function logAiUsage(params: {
  tenantId: string;
  service: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
}): Promise<void> {
  const { tenantId, service, model, inputTokens = 0, outputTokens = 0 } = params;

  const pricing = model ? PRICING[model] : undefined;
  const estimatedCost = pricing
    ? (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output
    : 0;

  await prisma.aIUsageLog.create({
    data: {
      tenantId,
      service,
      model: model ?? null,
      inputTokens,
      outputTokens,
      estimatedCost,
    },
  });
}
