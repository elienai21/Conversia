// src/routes/billing.routes.ts
// Stripe billing integration: checkout sessions, customer portal, webhooks.
// All routes require authMiddleware + requireAdmin EXCEPT /webhook (Stripe server).
//
// Environment variables required (set in Railway):
//   STRIPE_SECRET_KEY         — sk_live_... or sk_test_...
//   STRIPE_WEBHOOK_SECRET     — whsec_... from Stripe dashboard
//   STRIPE_PRICE_STARTER      — price_... for R$399/mo
//   STRIPE_PRICE_PROFESSIONAL — price_... for R$799/mo
//   STRIPE_PRICE_SCALE        — price_... for R$1499/mo
//   STRIPE_PRICE_ENTERPRISE   — price_... for custom

import type { FastifyInstance } from "fastify";
import Stripe from "stripe";
import { config } from "../config.js";
import { authMiddleware, requireAdmin } from "../middleware/auth.middleware.js";
import { PLANS, type PlanId } from "../lib/plans.js";

// ── Plan → Stripe Price ID mapping ──────────────────────────────────────────
const PLAN_PRICE_MAP: Record<string, string> = {
  starter: config.STRIPE_PRICE_STARTER,
  professional: config.STRIPE_PRICE_PROFESSIONAL,
  scale: config.STRIPE_PRICE_SCALE,
  enterprise: config.STRIPE_PRICE_ENTERPRISE,
};

function getStripe(): Stripe | null {
  if (!config.STRIPE_SECRET_KEY) return null;
  return new Stripe(config.STRIPE_SECRET_KEY, { apiVersion: "2026-03-25.dahlia" });
}

// ── Raw body capture (needed for Stripe webhook signature) ───────────────────
// We override the JSON content type parser within this plugin scope only.
// Other routes are not affected because Fastify encapsulates parsers per plugin.

export async function billingRoutes(app: FastifyInstance): Promise<void> {
  // Override JSON parser inside this plugin to capture raw body for webhook verification
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (_req, body: Buffer, done) => {
      (_req as unknown as Record<string, unknown>).rawBody = body;
      try {
        done(null, JSON.parse(body.toString("utf8")));
      } catch (err) {
        done(err as Error);
      }
    },
  );

  // ── GET /billing/plans ─────────────────────────────────────────────────────
  // Public: returns plan definitions + marks the current tenant's active plan.
  app.get(
    "/plans",
    { onRequest: authMiddleware },
    async (request, reply) => {
      const { prisma } = request.server.deps;
      const tenant = await prisma.tenant.findUnique({
        where: { id: request.user.tenantId },
        select: { plan: true, planStatus: true, trialEndsAt: true },
      });

      const plans = Object.values(PLANS).map((p) => ({
        id: p.id,
        label: p.label,
        priceMonthlyBrl: p.priceMonthlyBrl,
        maxUnits: p.maxUnits,
        maxUsers: p.maxUsers,
        features: p.features,
        stripePriceId: PLAN_PRICE_MAP[p.id] || null,
        isCurrent: tenant?.plan === p.id,
      }));

      return reply.send({
        plans,
        current: {
          plan: tenant?.plan ?? "trial",
          status: tenant?.planStatus ?? "trial",
          trialEndsAt: tenant?.trialEndsAt ?? null,
          stripeEnabled: !!config.STRIPE_SECRET_KEY,
        },
      });
    },
  );

  // ── POST /billing/checkout ─────────────────────────────────────────────────
  // Creates a Stripe Checkout session for upgrading to a paid plan.
  // Returns { url } — frontend redirects the user there.
  app.post(
    "/checkout",
    { onRequest: [authMiddleware, requireAdmin] },
    async (request, reply) => {
      const stripe = getStripe();
      if (!stripe) {
        return reply.status(503).send({
          detail: "Billing not configured. Set STRIPE_SECRET_KEY to enable payments.",
        });
      }

      const { prisma } = request.server.deps;
      const body = request.body as { plan?: string };
      const planId = body.plan as PlanId;

      if (!planId || !PLANS[planId] || planId === "trial") {
        return reply.status(400).send({ detail: "Plano inválido." });
      }

      const priceId = PLAN_PRICE_MAP[planId];
      if (!priceId) {
        return reply.status(400).send({
          detail: `Preço não configurado para o plano ${planId}. Configure STRIPE_PRICE_${planId.toUpperCase()}.`,
        });
      }

      const tenant = await prisma.tenant.findUnique({
        where: { id: request.user.tenantId },
        select: { id: true, name: true, stripeCustomerId: true, stripeSubscriptionId: true },
      });

      if (!tenant) {
        return reply.status(404).send({ detail: "Tenant not found." });
      }

      const user = await prisma.user.findUnique({
        where: { id: request.user.id },
        select: { email: true, fullName: true },
      });

      // Reuse existing Stripe customer or create a new one
      let customerId = tenant.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user?.email,
          name: tenant.name,
          metadata: { tenantId: tenant.id },
        });
        customerId = customer.id;
        await prisma.tenant.update({
          where: { id: tenant.id },
          data: { stripeCustomerId: customerId },
        });
      }

      // If already subscribed → redirect to portal instead
      if (tenant.stripeSubscriptionId) {
        const portalSession = await stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: `${config.FRONTEND_URL}/billing`,
        });
        return reply.send({ url: portalSession.url });
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${config.FRONTEND_URL}/billing?success=1&plan=${planId}`,
        cancel_url: `${config.FRONTEND_URL}/billing?cancelled=1`,
        allow_promotion_codes: true,
        metadata: { tenantId: tenant.id, plan: planId },
        subscription_data: {
          metadata: { tenantId: tenant.id, plan: planId },
        },
        locale: "pt-BR",
      });

      return reply.send({ url: session.url });
    },
  );

  // ── POST /billing/portal ───────────────────────────────────────────────────
  // Opens the Stripe Customer Portal for the current tenant (manage/cancel sub).
  app.post(
    "/portal",
    { onRequest: [authMiddleware, requireAdmin] },
    async (request, reply) => {
      const stripe = getStripe();
      if (!stripe) {
        return reply.status(503).send({ detail: "Billing not configured." });
      }

      const { prisma } = request.server.deps;
      const tenant = await prisma.tenant.findUnique({
        where: { id: request.user.tenantId },
        select: { stripeCustomerId: true },
      });

      if (!tenant?.stripeCustomerId) {
        return reply.status(400).send({
          detail: "Nenhuma assinatura encontrada. Faça um upgrade primeiro.",
        });
      }

      const session = await stripe.billingPortal.sessions.create({
        customer: tenant.stripeCustomerId,
        return_url: `${config.FRONTEND_URL}/billing`,
      });

      return reply.send({ url: session.url });
    },
  );

  // ── POST /billing/webhook ──────────────────────────────────────────────────
  // Stripe sends events here — updates tenant plan based on subscription events.
  // MUST be exempt from rate limiting and authentication.
  app.post("/webhook", async (request, reply) => {
    const stripe = getStripe();
    if (!stripe) {
      return reply.status(200).send({ received: true }); // ack without processing
    }

    const sig = request.headers["stripe-signature"] as string | undefined;
    const rawBody = (request as unknown as Record<string, unknown>).rawBody as Buffer | undefined;

    if (!sig || !rawBody) {
      return reply.status(400).send({ detail: "Missing signature or body." });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, config.STRIPE_WEBHOOK_SECRET);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Webhook signature verification failed";
      app.log.warn({ err }, `[Billing] Webhook signature failed: ${message}`);
      return reply.status(400).send({ detail: message });
    }

    const { prisma } = request.server.deps;

    try {
      await handleStripeEvent(event, prisma, app.log);
    } catch (err) {
      app.log.error({ err, eventType: event.type }, "[Billing] Error handling webhook event");
      // Return 200 to prevent Stripe from retrying — log error for investigation
    }

    return reply.send({ received: true });
  });
}

// ── Stripe event handler ─────────────────────────────────────────────────────

async function handleStripeEvent(
  event: Stripe.Event,
  prisma: FastifyInstance["deps"]["prisma"],
  log: FastifyInstance["log"],
): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription") break;

      const tenantId = session.metadata?.tenantId;
      const plan = session.metadata?.plan;
      if (!tenantId || !plan) break;

      await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          plan,
          planStatus: "active",
          stripeSubscriptionId: session.subscription as string,
        },
      });
      log.info({ tenantId, plan }, "[Billing] Subscription activated");
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const tenantId = sub.metadata?.tenantId;
      if (!tenantId) break;

      const plan = sub.metadata?.plan ?? "starter";
      const status = stripeStatusToLocal(sub.status);

      await prisma.tenant.update({
        where: { id: tenantId },
        data: { plan, planStatus: status },
      });
      log.info({ tenantId, plan, status }, "[Billing] Subscription updated");
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const tenantId = sub.metadata?.tenantId;
      if (!tenantId) break;

      await prisma.tenant.update({
        where: { id: tenantId },
        data: { plan: "trial", planStatus: "cancelled", stripeSubscriptionId: null },
      });
      log.info({ tenantId }, "[Billing] Subscription cancelled — reverted to trial");
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      if (!customerId) break;

      await prisma.tenant.updateMany({
        where: { stripeCustomerId: customerId },
        data: { planStatus: "past_due" },
      });
      log.warn({ customerId }, "[Billing] Payment failed — plan marked past_due");
      break;
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      if (!customerId) break;

      await prisma.tenant.updateMany({
        where: { stripeCustomerId: customerId, planStatus: "past_due" },
        data: { planStatus: "active" },
      });
      break;
    }

    default:
      break;
  }
}

function stripeStatusToLocal(status: Stripe.Subscription.Status): string {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
      return "cancelled";
    default:
      return "active";
  }
}
