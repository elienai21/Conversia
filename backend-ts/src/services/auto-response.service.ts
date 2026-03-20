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
import { CrmAdapterFactory } from "../adapters/crm/crm.factory.js";

/**
 * Executes CRM tool calls from the AI model.
 * Returns a JSON string with the result.
 */
async function executeCrmToolCall(tenantId: string, fnName: string, args: Record<string, unknown>): Promise<string> {
  try {
    const adapterResult = await CrmAdapterFactory.getAdapter(tenantId);
    if (!adapterResult.ok) {
      return JSON.stringify({ error: adapterResult.error.message });
    }
    const adapter = adapterResult.value;

    if (fnName === "search_available_listings") {
      const res = await adapter.searchListings({ from: args.from as string, to: args.to as string, guests: args.guests as number });
      return JSON.stringify(res.ok ? res.value : { error: res.error.message });
    } else if (fnName === "calculate_price") {
      const res = await adapter.calculatePrice({ listingIds: args.listingIds as string[], from: args.from as string, to: args.to as string, guests: args.guests as number });
      return JSON.stringify(res.ok ? res.value : { error: res.error.message });
    } else if (fnName === "get_reservation_details") {
      const res = await adapter.getReservation(args.reservationCode as string);
      return JSON.stringify(res.ok ? res.value : { error: res.error.message });
    } else if (fnName === "get_all_properties") {
      const res = await adapter.getProperties();
      return JSON.stringify(res.ok ? res.value : { error: res.error.message });
    } else if (fnName === "get_listing_details") {
      const res = await adapter.getListing(args.listingId as string);
      return JSON.stringify(res.ok ? res.value : { error: res.error.message });
    } else if (fnName === "get_house_rules") {
      const res = await adapter.getHouseRules(args.listingId as string);
      return JSON.stringify(res.ok ? res.value : { error: res.error.message });
    }
    return JSON.stringify({ error: `Unknown tool: ${fnName}` });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return JSON.stringify({ error: `CRM execution error: ${msg}` });
  }
}

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

  // 1. Check tenant settings
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId },
  });

  if (!settings?.enableAutoResponse) return false;

  // 2. Check if intent is in the allowed list
  const allowedIntents: string[] = settings.autoResponseIntents
    ? JSON.parse(settings.autoResponseIntents)
    : [];

  if (allowedIntents.length > 0 && !allowedIntents.includes(intent)) {
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

  if (!apiKey) return false;

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
          console.log(`[AutoResponse] CRM tool call: ${toolCall.function.name}(${JSON.stringify(args)})`);
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
    console.error("[AutoResponse] OpenAI/CRM error:", openaiErr);
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

  if (!answerText || answerText === "NO_MATCH") return false;

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

  console.log(`[AutoResponse] Sent auto-response for conversation ${conversationId} (intent: ${intent})`);
  return true;
}
