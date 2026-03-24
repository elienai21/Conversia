import { Resend } from "resend";
import { config } from "../config.js";
import { logger } from "../lib/logger.js";

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  fromName?: string;
}): Promise<{ id: string }> {
  if (!config.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY not configured. Add it to Railway environment variables.");
  }

  const resend = new Resend(config.RESEND_API_KEY);

  const from = config.EMAIL_FROM || "Conversia <onboarding@resend.dev>";

  const { data, error } = await resend.emails.send({
    from,
    to: params.to,
    subject: params.subject,
    html: params.html,
  });

  if (error) {
    logger.error({ error }, "[Email] Resend error");
    throw new Error(error.message);
  }

  logger.info(`[Email] Sent to ${params.to} — id: ${data!.id}`);
  return { id: data!.id };
}
