import type { FastifyInstance } from "fastify";
import OpenAI from "openai";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { prisma } from "../lib/prisma.js";
import { decrypt } from "../lib/encryption.js";
import { config } from "../config.js";
import { z } from "zod";

const synthesizeSchema = z.object({
  text: z.string().min(1, "Text is required").max(4096, "Text is too long"),
  voice: z.enum(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]).optional().default("alloy"),
});

export async function audioRoutes(app: FastifyInstance): Promise<void> {
  // Ensure the user is authenticated securely
  app.addHook("onRequest", authMiddleware);

  /**
   * POST /api/v1/audio/transcribe
   * Converts uploaded audio (Speech) into Text using OpenAI Whisper
   */
  app.post("/transcribe", async (request, reply) => {
    const user = request.user;
    const data = await request.file();

    if (!data) {
      return reply.status(400).send({ detail: "No audio file provided" });
    }

    try {
      // Get API Key (Tenant specific or fallback to Global)
      const tenantSettings = await prisma.tenantSettings.findUnique({
        where: { tenantId: user.tenantId },
      });

      const apiKey = tenantSettings?.openaiApiKey
        ? decrypt(tenantSettings.openaiApiKey)
        : config.OPENAI_API_KEY;

      const openai = new OpenAI({ apiKey });

      // Ensure the file looks like a Web API File/Blob object for OpenAI SDK
      // Using the underlying buffer as a File-like object
      const fileBuffer = await data.toBuffer();
      const fileExt = data.mimetype.includes("webm") ? "webm" : data.mimetype.includes("ogg") ? "ogg" : "mp3";
      
      const file = new File([new Uint8Array(fileBuffer)], `audio.${fileExt}`, {
        type: data.mimetype,
      });

      const transcription = await openai.audio.transcriptions.create({
        file: file,
        model: "whisper-1",
        language: user.preferredLanguage.split("-")[0], // e.g., 'pt' from 'pt-BR'
      });

      return reply.send({ text: transcription.text });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ detail: "Failed to transcribe audio" });
    }
  });

  /**
   * POST /api/v1/audio/synthesize
   * Converts Text into high-quality Speech (audio) using OpenAI TTS
   */
  app.post("/synthesize", async (request, reply) => {
    const user = request.user;

    const parsed = synthesizeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({ detail: "Invalid request body", errors: parsed.error.format() });
    }

    try {
      // Get API Key (Tenant specific or fallback to Global)
      const tenantSettings = await prisma.tenantSettings.findUnique({
        where: { tenantId: user.tenantId },
      });

      const apiKey = tenantSettings?.openaiApiKey
        ? decrypt(tenantSettings.openaiApiKey)
        : config.OPENAI_API_KEY;

      const openai = new OpenAI({ apiKey });

      const mp3 = await openai.audio.speech.create({
        model: "tts-1",
        voice: parsed.data.voice,
        input: parsed.data.text,
      });

      // Get the buffer directly
      const buffer = Buffer.from(await mp3.arrayBuffer());

      // Send the audio buffer back
      return reply
        .header("Content-Type", "audio/mpeg")
        .header("Content-Length", buffer.length)
        .send(buffer);
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ detail: "Failed to synthesize speech" });
    }
  });
}
