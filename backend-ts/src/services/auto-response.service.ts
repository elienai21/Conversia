import OpenAI from "openai";
import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { decrypt } from "../lib/encryption.js";
import { saveMessage, saveTranslation } from "./message.service.js";
import { translateText } from "./translation.service.js";
import { sendWhatsappMessage } from "./whatsapp.service.js";
import { sendInstagramMessage } from "./instagram.service.js";
import { logAiUsage } from "./usage-log.service.js";
import { SocketService } from "./socket.service.js";
import { generateEmbedding } from "./embedding.service.js";

/**
 * Attempts to auto-respond to a customer message using the knowledge base.
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

  // 4. Generate short FAQ answer using OpenAI
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

  let systemDirective = `You are an automated FAQ assistant. Based ONLY on the knowledge base below, provide a brief, helpful answer. If the knowledge base doesn't contain relevant information, respond with exactly "NO_MATCH".`;
  
  if (intent === "parceria") {
    systemDirective = `You are an automated relationship assistant. The user wants to offer a property for your company to manage ("parceria"). Be enthusiastic, explain you would love to schedule a presentation meeting, and ask for their availability. Don't return NO_MATCH.`;
  }

  const response = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: `${systemDirective}

Knowledge Base:
${kbContext}

Reply in ${tenantLang}. Keep it under 3 sentences. Be friendly and professional.`,
      },
      {
        role: "user",
        content: `Customer intent: ${intent}. Please provide a relevant FAQ answer.`,
      },
    ],
    temperature: 0.3,
    max_tokens: 150,
  });

  if (response.usage) {
    await logAiUsage({
      tenantId,
      service: "auto_response",
      model,
      inputTokens: response.usage.prompt_tokens,
      outputTokens: response.usage.completion_tokens,
    });
  }

  const answerText = response.choices[0]?.message?.content?.trim() || "";

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
