import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { copilotQueue } from "../lib/queue.js";
import { prisma } from "../lib/prisma.js";
import type { SuggestionOut } from "../schemas/suggestion.schema.js";
import type { CopilotJobData } from "../lib/queue.js";

export async function jobRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", authMiddleware);

  // Poll job status by ID
  app.get<{ Params: { jobId: string } }>(
    "/:jobId",
    async (request, reply) => {
      const user = request.user;
      const { jobId } = request.params;

      const job = await copilotQueue.getJob(jobId);

      if (!job) {
        return reply.status(404).send({ detail: "Job not found" });
      }

      // Verify tenant ownership
      const jobData = job.data as CopilotJobData;
      if (jobData.tenantId !== user.tenantId) {
        return reply.status(404).send({ detail: "Job not found" });
      }

      const state = await job.getState();

      if (state === "completed") {
        // Fetch the persisted suggestion from DB
        const suggestion = await prisma.aISuggestion.findFirst({
          where: {
            messageId: jobData.message.id,
            agentId: jobData.agentId,
          },
          orderBy: { createdAt: "desc" },
        });

        if (!suggestion) {
          return reply.send({
            job_id: jobId,
            status: "completed",
            detail: "Job completed but suggestion not found in database.",
          });
        }

        const result: SuggestionOut = {
          id: suggestion.id,
          message_id: suggestion.messageId,
          suggestion_text: suggestion.suggestionText,
          suggestion_language: suggestion.suggestionLanguage,
          was_used: suggestion.wasUsed,
          created_at: suggestion.createdAt,
        };

        return reply.send({
          job_id: jobId,
          status: "completed",
          suggestion: result,
        });
      }

      if (state === "failed") {
        return reply.send({
          job_id: jobId,
          status: "failed",
          detail: job.failedReason ?? "Unknown error",
        });
      }

      // waiting, active, delayed, etc.
      return reply.send({
        job_id: jobId,
        status: state,
      });
    },
  );
}
