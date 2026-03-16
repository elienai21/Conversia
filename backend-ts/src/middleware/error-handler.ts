import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../lib/errors.js";

export function errorHandler(
  error: FastifyError,
  _request: FastifyRequest,
  reply: FastifyReply,
): void {
  if (error instanceof AppError) {
    reply.status(error.statusCode).send({
      detail: error.message,
    });
    return;
  }

  // Fastify validation errors
  if (error.validation) {
    reply.status(422).send({
      detail: "Validation error",
      errors: error.validation,
    });
    return;
  }

  console.error("Unhandled error:", error);
  reply.status(500).send({ detail: "Internal server error" });
}
