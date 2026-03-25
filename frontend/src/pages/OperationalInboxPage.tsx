// src/pages/OperationalInboxPage.tsx
import { HardHat, Users } from "lucide-react";
import { SharedTeamInbox, type TeamInboxConfig } from "@/components/SharedTeamInbox";
import type { ReactNode } from "react";

type Conv = { customer: { phone: string; name?: string | null } | null };

function tagLabel(conv: Conv): string {
  const phone = conv.customer?.phone || "";
  if (phone.includes("@g.us")) return "Grupo";
  return "Equipe";
}

function tagColor(conv: Conv): string {
  const phone = conv.customer?.phone || "";
  if (phone.includes("@g.us")) return "var(--accent-info, #3b82f6)";
  return "var(--accent-warning, #f59e0b)";
}

const config: TeamInboxConfig = {
  scope: "operations",
  title: "Inbox Operacional",
  icon: <HardHat size={22} color="var(--accent-warning, #f59e0b)" /> as ReactNode,
  avatarFallback: (conv) => (
    (conv.customer?.phone || "").includes("@g.us")
      ? <Users size={20} /> as ReactNode
      : <HardHat size={20} /> as ReactNode
  ),
  tagLabel,
  tagColor,
  emptyIcon: <HardHat size={48} strokeWidth={1} /> as ReactNode,
  emptyTitle: "Inbox Operacional",
  emptySubtitle: "Adicione membros da equipe ou grupos WhatsApp",
  inputPlaceholder: 'Responder ao staff... (Shift+Enter para nova linha, "/" para atalhos)',
  tabs: ["all", "unread", "groups"],
};

export function OperationalInboxPage() {
  return <SharedTeamInbox config={config} />;
}
