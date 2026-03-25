import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

/** Escapes a CSV cell value (quotes strings with commas/quotes/newlines) */
function csvCell(val: unknown): string {
  const s = val == null ? "" : String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildCsvRow(values: unknown[]): string {
  return values.map(csvCell).join(",");
}

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", authMiddleware);

  // GET /overview — Dashboard metrics
  app.get("/overview", async (request) => {
    const tenantId = request.user.tenantId;

    const [
      totalConversations,
      activeConversations,
      queuedConversations,
      closedConversations,
      activeAgents,
      totalAgents,
      suggestionsUsed,
      suggestionsTotal,
      totalCustomers,
    ] = await Promise.all([
      prisma.conversation.count({ where: { tenantId } }),
      prisma.conversation.count({ where: { tenantId, status: "active" } }),
      prisma.conversation.count({ where: { tenantId, status: "queued" } }),
      prisma.conversation.count({ where: { tenantId, status: "closed" } }),
      prisma.user.count({ where: { tenantId, isOnline: true, isActive: true } }),
      prisma.user.count({ where: { tenantId, isActive: true } }),
      prisma.aISuggestion.count({
        where: { agent: { tenantId }, wasUsed: true },
      }),
      prisma.aISuggestion.count({
        where: { agent: { tenantId } },
      }),
      prisma.customer.count({ where: { tenantId } }),
    ]);

    // Average resolution time from recent closed conversations
    const closedConvs = await prisma.conversation.findMany({
      where: { tenantId, status: "closed" },
      select: { createdAt: true, updatedAt: true },
      take: 100,
      orderBy: { updatedAt: "desc" },
    });

    let avgResolutionSeconds = 0;
    if (closedConvs.length > 0) {
      const totalSeconds = closedConvs.reduce((sum, c) => {
        return sum + (c.updatedAt.getTime() - c.createdAt.getTime()) / 1000;
      }, 0);
      avgResolutionSeconds = Math.round(totalSeconds / closedConvs.length);
    }

    const automationRate = suggestionsTotal > 0
      ? Math.round((suggestionsUsed / suggestionsTotal) * 100)
      : 0;

    return {
      total_conversations: totalConversations,
      active_conversations: activeConversations,
      queued_conversations: queuedConversations,
      closed_conversations: closedConversations,
      active_agents: activeAgents,
      total_agents: totalAgents,
      total_customers: totalCustomers,
      avg_resolution_time_seconds: avgResolutionSeconds,
      suggestions_used: suggestionsUsed,
      suggestions_total: suggestionsTotal,
      automation_rate: automationRate,
    };
  });

  // GET /volume?days=7 — Conversation volume chart data
  app.get("/volume", async (request) => {
    const tenantId = request.user.tenantId;
    const query = request.query as Record<string, string>;
    const days = Math.min(parseInt(query.days || "7", 10), 90);

    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const [conversations, suggestions] = await Promise.all([
      prisma.conversation.findMany({
        where: { tenantId, createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      prisma.aISuggestion.findMany({
        where: { agent: { tenantId }, createdAt: { gte: since } },
        select: { createdAt: true },
      }),
    ]);

    // Build date-keyed map
    const volumeMap = new Map<string, { total: number; aiHandled: number }>();
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().split("T")[0];
      volumeMap.set(key, { total: 0, aiHandled: 0 });
    }

    for (const c of conversations) {
      const key = c.createdAt.toISOString().split("T")[0];
      const entry = volumeMap.get(key);
      if (entry) entry.total++;
    }

    for (const s of suggestions) {
      const key = s.createdAt.toISOString().split("T")[0];
      const entry = volumeMap.get(key);
      if (entry) entry.aiHandled++;
    }

    return Array.from(volumeMap.entries()).map(([date, data]) => ({
      date,
      name: new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" }),
      total: data.total,
      aiHandled: data.aiHandled,
    }));
  });

  // GET /export/overview — CSV download of dashboard KPIs
  app.get("/export/overview", async (request, reply) => {
    const tenantId = request.user.tenantId;

    const [
      totalConversations,
      activeConversations,
      queuedConversations,
      closedConversations,
      activeAgents,
      totalAgents,
      suggestionsUsed,
      suggestionsTotal,
      totalCustomers,
    ] = await Promise.all([
      prisma.conversation.count({ where: { tenantId } }),
      prisma.conversation.count({ where: { tenantId, status: "active" } }),
      prisma.conversation.count({ where: { tenantId, status: "queued" } }),
      prisma.conversation.count({ where: { tenantId, status: "closed" } }),
      prisma.user.count({ where: { tenantId, isOnline: true, isActive: true } }),
      prisma.user.count({ where: { tenantId, isActive: true } }),
      prisma.aISuggestion.count({ where: { agent: { tenantId }, wasUsed: true } }),
      prisma.aISuggestion.count({ where: { agent: { tenantId } } }),
      prisma.customer.count({ where: { tenantId } }),
    ]);

    const closedConvs = await prisma.conversation.findMany({
      where: { tenantId, status: "closed" },
      select: { createdAt: true, updatedAt: true },
      take: 100,
      orderBy: { updatedAt: "desc" },
    });

    let avgResolutionSeconds = 0;
    if (closedConvs.length > 0) {
      const totalSeconds = closedConvs.reduce(
        (sum, c) => sum + (c.updatedAt.getTime() - c.createdAt.getTime()) / 1000,
        0,
      );
      avgResolutionSeconds = Math.round(totalSeconds / closedConvs.length);
    }

    const automationRate =
      suggestionsTotal > 0 ? Math.round((suggestionsUsed / suggestionsTotal) * 100) : 0;

    const rows = [
      buildCsvRow(["Metric", "Value"]),
      buildCsvRow(["Generated At", new Date().toISOString()]),
      buildCsvRow(["Total Conversations", totalConversations]),
      buildCsvRow(["Active Conversations", activeConversations]),
      buildCsvRow(["Queued Conversations", queuedConversations]),
      buildCsvRow(["Closed Conversations", closedConversations]),
      buildCsvRow(["Total Customers", totalCustomers]),
      buildCsvRow(["Total Agents", totalAgents]),
      buildCsvRow(["Online Agents", activeAgents]),
      buildCsvRow(["AI Suggestions Total", suggestionsTotal]),
      buildCsvRow(["AI Suggestions Used", suggestionsUsed]),
      buildCsvRow(["AI Automation Rate (%)", automationRate]),
      buildCsvRow(["Avg Resolution Time (s)", avgResolutionSeconds]),
    ];

    const csv = rows.join("\r\n");
    const filename = `analytics-overview-${new Date().toISOString().split("T")[0]}.csv`;

    reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .send("\uFEFF" + csv); // BOM for Excel compatibility
  });

  // GET /export/volume?days=30 — CSV download of daily volume data
  app.get("/export/volume", async (request, reply) => {
    const tenantId = request.user.tenantId;
    const query = request.query as Record<string, string>;
    const days = Math.min(parseInt(query.days || "30", 10), 90);

    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const [conversations, suggestions] = await Promise.all([
      prisma.conversation.findMany({
        where: { tenantId, createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      prisma.aISuggestion.findMany({
        where: { agent: { tenantId }, createdAt: { gte: since } },
        select: { createdAt: true },
      }),
    ]);

    const volumeMap = new Map<string, { total: number; aiHandled: number }>();
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      volumeMap.set(d.toISOString().split("T")[0], { total: 0, aiHandled: 0 });
    }

    for (const c of conversations) {
      const key = c.createdAt.toISOString().split("T")[0];
      const entry = volumeMap.get(key);
      if (entry) entry.total++;
    }
    for (const s of suggestions) {
      const key = s.createdAt.toISOString().split("T")[0];
      const entry = volumeMap.get(key);
      if (entry) entry.aiHandled++;
    }

    const header = buildCsvRow(["Date", "Total Conversations", "AI Handled", "AI Rate (%)"]);
    const dataRows = Array.from(volumeMap.entries()).map(([date, data]) => {
      const rate = data.total > 0 ? Math.round((data.aiHandled / data.total) * 100) : 0;
      return buildCsvRow([date, data.total, data.aiHandled, rate]);
    });

    const csv = [header, ...dataRows].join("\r\n");
    const filename = `analytics-volume-${days}d-${new Date().toISOString().split("T")[0]}.csv`;

    reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .send("\uFEFF" + csv);
  });
}
