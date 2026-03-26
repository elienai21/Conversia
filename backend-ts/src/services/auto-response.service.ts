import OpenAI from "openai";
import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { decrypt } from "../lib/encryption.js";
import { saveMessage, saveTranslation, getRecentMessages } from "./message.service.js";
import { translateText } from "./translation.service.js";
import { sendWhatsappMessage } from "./whatsapp.service.js";
import { sendInstagramMessage } from "./instagram.service.js";
import { logAiUsage } from "./usage-log.service.js";
import { SocketService } from "./socket.service.js";
import { generateEmbedding } from "./embedding.service.js";
import { crmTools } from "./ai-tools.js";
import { logger } from "../lib/logger.js";
import { executeCrmToolCall } from "./crm-tools.service.js";
import { CrmAdapterFactory } from "../adapters/crm/crm.factory.js";

import { resolveAutoResponseEnabled } from "./business-hours.service.js";

/**
 * Attempts to auto-respond to a customer message using the knowledge base + CRM tools.
 * Returns true if an auto-response was sent, false if it should fall through to agent assignment.
 */
export async function tryAutoResponse(params: {
  tenantId: string;
  conversationId: string;
  intent: string;
  detectedLang: string;
}): Promise<boolean> {
  const { tenantId, conversationId, intent, detectedLang } = params;

  // 1. Check tenant settings & resolve auto-response mode
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId },
  });

  const shouldAutoRespond = resolveAutoResponseEnabled({
    autoResponseMode: settings?.autoResponseMode || "manual",
    enableAutoResponse: settings?.enableAutoResponse ?? false,
    timezone: settings?.timezone || "America/Sao_Paulo",
    businessHoursStart: settings?.businessHoursStart || "08:00",
    businessHoursEnd: settings?.businessHoursEnd || "18:00",
    businessHoursDays: settings?.businessHoursDays || "[1,2,3,4,5]",
  });

  if (!shouldAutoRespond) {
    logger.info(`[AutoResponse] Disabled for tenant ${tenantId} (mode=${settings?.autoResponseMode || "manual"})`);
    return false;
  }

  // 2. Check if intent is in the allowed list
  const allowedIntents: string[] = settings.autoResponseIntents
    ? JSON.parse(settings.autoResponseIntents)
    : [];

  if (allowedIntents.length > 0 && !allowedIntents.includes(intent)) {
    logger.info(`[AutoResponse] Intent "${intent}" not in allowed list [${allowedIntents.join(", ")}] for tenant ${tenantId}`);
    return false;
  }

  // 3. Find matching KB entries via RAG
  const lastMsg = await prisma.message.findFirst({
    where: { conversationId, senderType: "customer" },
    orderBy: { createdAt: "desc" },
    select: { originalText: true },
  });

  const queryEmbedding = lastMsg 
    ? await generateEmbedding(tenantId, lastMsg.originalText) 
    : null;

  let kbEntries: Array<{ title: string; content: string; category: string }> = [];

  if (queryEmbedding && queryEmbedding.length > 0) {
    const embeddingString = `[${queryEmbedding.join(",")}]`;
    kbEntries = await prisma.$queryRaw<
      Array<{ title: string; content: string; category: string }>
    >`
      SELECT title, content, category 
      FROM knowledge_base 
      WHERE tenant_id = ${tenantId}::uuid AND is_active = true 
      ORDER BY embedding <=> ${embeddingString}::vector 
      LIMIT 5
    `;
  } else {
    kbEntries = await prisma.knowledgeBase.findMany({
      where: {
        tenantId,
        isActive: true,
        OR: [{ category: intent }, { category: "general" }, { category: "outro" }],
      },
      select: { title: true, content: true, category: true },
      take: 5,
    });
  }

  // 4. Generate answer using OpenAI with CRM function calling
  const apiKey = settings.openaiApiKey
    ? decrypt(settings.openaiApiKey)
    : config.OPENAI_API_KEY;

  if (!apiKey) {
    logger.warn(`[AutoResponse] No OpenAI API key available for tenant ${tenantId}`);
    return false;
  }

  const openai = new OpenAI({ apiKey });
  const model = settings.openaiModel || config.OPENAI_MODEL;

  const kbContext = kbEntries
    .map((kb) => `[${kb.category}] ${kb.title}: ${kb.content}`)
    .join("\n\n");

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { defaultLanguage: true },
  });

  const tenantLang = tenant?.defaultLanguage || "en";

  // Get recent messages for full context
  const recentMessages = await getRecentMessages(conversationId, 10);
  const conversationContext: OpenAI.ChatCompletionMessageParam[] = recentMessages
    .reverse()
    .map((m) => ({
      role: m.senderType === "customer" ? ("user" as const) : ("assistant" as const),
      content: m.originalText,
    }));

  let systemDirective = `Você é um assistente automatizado de atendimento ao cliente para uma empresa de hospedagem.
Use a base de conhecimento abaixo E as ferramentas de CRM disponíveis para responder perguntas sobre:
- Disponibilidade de apartamentos/unidades (use search_available_listings)
- Preços e valores (use calculate_price)
- Detalhes de reservas (use get_reservation_details)
- Detalhes das propriedades (use get_listing_details, get_all_properties)
- Regras da casa e horários (use get_house_rules)

Se a base de conhecimento NÃO contiver informações relevantes E as ferramentas de CRM não puderem ajudar, responda exatamente "NO_MATCH".

Base de Conhecimento:
${kbContext}`;

  if (intent === "parceria") {
    systemDirective = `Você é um assistente automatizado de relacionamento. O usuário quer oferecer um imóvel para sua empresa administrar ("parceria"). Seja entusiasmado, explique que adoraria agendar uma reunião de apresentação, e pergunte a disponibilidade dele. Nunca retorne NO_MATCH.`;
  }

  systemDirective += `\n\nResponda em ${tenantLang}. Seja breve (máximo 3-4 frases), amigável e profissional.`;

  // Check if CRM is configured to decide whether to use tools
  const crmResult = await CrmAdapterFactory.getAdapter(tenantId);
  const hasCrm = crmResult.ok;
  logger.info(`[AutoResponse] CRM configured: ${hasCrm} for tenant ${tenantId}`);

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemDirective },
    ...conversationContext,
  ];

  let answerText = "";
  let totalUsage = { prompt_tokens: 0, completion_tokens: 0 };

  try {
    // Function calling loop (up to 5 iterations)
    for (let i = 0; i < 5; i++) {
      const requestParams: OpenAI.ChatCompletionCreateParamsNonStreaming = {
        model,
        messages,
        temperature: 0.3,
        max_tokens: 300,
      };

      // Only include CRM tools if CRM is configured
      if (hasCrm) {
        requestParams.tools = crmTools;
        requestParams.tool_choice = "auto";
      }

      const response = await openai.chat.completions.create(requestParams);

      if (response.usage) {
        totalUsage.prompt_tokens += response.usage.prompt_tokens;
        totalUsage.completion_tokens += response.usage.completion_tokens;
      }

      const responseMessage = response.choices[0]?.message;
      if (!responseMessage) break;

      messages.push(responseMessage);

      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        // Execute tool calls
        for (const toolCall of responseMessage.tool_calls) {
          if (toolCall.type !== "function") continue;
          const args = JSON.parse(toolCall.function.arguments);
          logger.info(`[AutoResponse] CRM tool call: ${toolCall.function.name}(${JSON.stringify(args)})`);
          const resultJson = await executeCrmToolCall(tenantId, toolCall.function.name, args);
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: resultJson,
          });
        }
        // Continue loop for LLM to process tool results
      } else {
        // Final response
        answerText = responseMessage.content?.trim() || "";
        break;
      }
    }
  } catch (openaiErr) {
    logger.error({ err: openaiErr }, "[AutoResponse] OpenAI/CRM error");
    return false;
  }

  if (totalUsage.prompt_tokens > 0) {
    await logAiUsage({
      tenantId,
      service: "auto_response",
      model,
      inputTokens: totalUsage.prompt_tokens,
      outputTokens: totalUsage.completion_tokens,
    });
  }

  if (!answerText || answerText === "NO_MATCH") {
    logger.info(`[AutoResponse] No suitable answer for tenant ${tenantId} (answer="${answerText || "empty"}")`);
    return false;
  }

  // 5. Save as system message
  const message = await saveMessage({
    conversationId,
    senderType: "system",
    text: answerText,
    detectedLanguage: tenantLang,
  });

  // 6. Translate to customer language if different
  let outboundText = answerText;
  if (detectedLang !== tenantLang) {
    const { translatedText, provider } = await translateText(
      tenantId,
      answerText,
      tenantLang,
      detectedLang,
    );
    await saveTranslation({
      messageId: message.id,
      sourceLanguage: tenantLang,
      targetLanguage: detectedLang,
      translatedText,
      provider,
    });
    outboundText = translatedText;
  }

  // 7. Send via appropriate channel
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { customer: true },
  });

  if (conversation?.customer) {
    if (conversation.channel === "whatsapp") {
      await sendWhatsappMessage(tenantId, conversation.customer.phone, outboundText);
    } else if (conversation.channel === "instagram") {
      if (settings.instagramPageAccessToken) {
        const token = decrypt(settings.instagramPageAccessToken);
        const igsid = conversation.customer.phone.replace(/^ig:/, "");
        await sendInstagramMessage(token, igsid, outboundText);
      }
    }
  }

  // 8. Emit socket events
  SocketService.emitToConversation(conversationId, "message.new", {
    id: message.id,
    conversation_id: message.conversationId,
    sender_type: message.senderType,
    original_text: message.originalText,
    detected_language: message.detectedLanguage,
    created_at: message.createdAt,
  });

  logger.info(`[AutoResponse] Sent auto-response for conversation ${conversationId} (intent: ${intent})`);
  return true;
}
