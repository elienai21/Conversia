import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";

export interface TokenUsageResult {
  allowed: boolean;
  usage: number;
  limit: number;
  providerType: "managed" | "custom";
  apiKey?: string | null;
}

export async function checkAiTokenLimit(tenantId: string): Promise<TokenUsageResult> {
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId },
    select: {
      useGlobalAiKey: true,
      aiMonthlyTokenLimit: true,
      openaiApiKey: true,
    }
  });

  if (!settings) {
    return { allowed: false, usage: 0, limit: 0, providerType: "managed" };
  }

  // Se o cliente conectou a própria chave e desativou a chave global, acesso é ilimitado do nosso lado
  if (!settings.useGlobalAiKey && settings.openaiApiKey) {
    return { allowed: true, usage: 0, limit: Infinity, providerType: "custom", apiKey: settings.openaiApiKey };
  }
  
  // Se nem chave global nem custom estão configuradas, recusa. Mas se o config.ts suprir, 
  // cai no managed mode abaixo. Vamos assumir que useGlobalAiKey habilitado engatilha modo SaaS.
  if (!settings.useGlobalAiKey) {
    // Para segurança: se useGlobal=false e NÃO tem chave própria, barrar com custom para emit erro óbvio
    return { allowed: false, usage: 0, limit: 0, providerType: "custom" };
  }

  const limit = settings.aiMonthlyTokenLimit;
  
  // Calcula o primeiro dia do corrente mês e último
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Soma os logs de input e output
  const usageAggregate = await prisma.aIUsageLog.aggregate({
    where: {
      tenantId: tenantId,
      createdAt: { gte: startOfMonth },
    },
    _sum: {
      inputTokens: true,
      outputTokens: true,
    }
  });

  const totalInput = usageAggregate._sum.inputTokens || 0;
  const totalOutput = usageAggregate._sum.outputTokens || 0;
  const usage = totalInput + totalOutput;

  return {
    allowed: usage < limit,
    usage,
    limit,
    providerType: "managed"
  };
}

export async function logAiUsage(params: {
  tenantId: string;
  service: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}) {
  await prisma.aIUsageLog.create({
    data: {
      tenantId: params.tenantId,
      service: params.service,
      model: params.model,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
    }
  });
}
