// src/pages/OwnersInboxPage.tsx
import { Briefcase, Users } from "lucide-react";
import { SharedTeamInbox, type TeamInboxConfig } from "@/components/SharedTeamInbox";
import type { ReactNode } from "react";

type Conv = { customer: { phone: string; name?: string | null } | null };

function tagLabel(_conv: Conv): string {
  return "Diretoria";
}

function tagColor(_conv: Conv): string {
  return "var(--accent-primary, #6366f1)";
}

const config: TeamInboxConfig = {
  scope: "owners",
  title: "Inbox Diretoria",
  icon: <Briefcase size={22} color="var(--accent-primary, #6366f1)" /> as ReactNode,
  avatarFallback: (conv) => (
    (conv.customer?.phone || "").includes("@g.us")
      ? <Users size={20} /> as ReactNode
      : <Briefcase size={20} /> as ReactNode
  ),
  tagLabel,
  tagColor,
  emptyIcon: <Briefcase size={48} strokeWidth={1} /> as ReactNode,
  emptyTitle: "Inbox Diretoria",
  emptySubtitle: "Adicione donos ou sócios com a role OWNER",
  inputPlaceholder: 'Escrever para a diretoria... (Shift+Enter para nova linha, "/" para atalhos)',
  tabs: ["all", "unread"],
};

export function OwnersInboxPage() {
  return <SharedTeamInbox config={config} />;
}
