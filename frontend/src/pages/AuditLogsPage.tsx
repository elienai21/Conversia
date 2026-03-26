// src/pages/AuditLogsPage.tsx
// Admin-only audit log viewer with filters.
import { useEffect, useState, useCallback } from "react";
import { Shield, Search, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { ApiService } from "@/services/api";
import "./AuditLogsPage.css";

interface AuditLog {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  userId: string | null;
}

interface AuditLogsResponse {
  total: number;
  page: number;
  limit: number;
  pages: number;
  logs: AuditLog[];
}

const ACTION_COLORS: Record<string, string> = {
  "user.login":          "#48bb78",
  "user.signup":         "#6366f1",
  "user.logout":         "#a0aec0",
  "settings.update":     "#f59e0b",
  "billing.checkout":    "#ec4899",
  "billing.cancelled":   "#fc8181",
  "service_order.create":"#38bdf8",
  "service_order.update":"#38bdf8",
};

function actionBadgeColor(action: string): string {
  return ACTION_COLORS[action] ?? "#a0aec0";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function AuditLogsPage() {
  const [data, setData] = useState<AuditLogsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "50");
      if (actionFilter) params.set("action", actionFilter);
      if (fromDate)     params.set("from", new Date(fromDate).toISOString());
      if (toDate)       params.set("to",   new Date(toDate + "T23:59:59").toISOString());

      const result = await ApiService.get<AuditLogsResponse>(`/audit-logs?${params.toString()}`);
      setData(result);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter, fromDate, toDate]);

  useEffect(() => { void fetchLogs(); }, [fetchLogs]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    void fetchLogs();
  };

  return (
    <div className="audit-page">
      {/* Header */}
      <div className="audit-header">
        <div className="audit-header__left">
          <Shield size={22} className="audit-header__icon" />
          <div>
            <h1 className="audit-header__title">Logs de Auditoria</h1>
            <p className="audit-header__subtitle">
              Registro de todas as ações na plataforma — conformidade LGPD e contratos enterprise
            </p>
          </div>
        </div>
        <button className="audit-refresh-btn" onClick={() => void fetchLogs()} disabled={loading}>
          <RefreshCw size={16} className={loading ? "spin" : ""} />
          Atualizar
        </button>
      </div>

      {/* Filters */}
      <form className="audit-filters" onSubmit={handleSearch}>
        <div className="audit-filter-group">
          <Search size={16} className="audit-filter-icon" />
          <input
            type="text"
            placeholder="Filtrar por ação (ex: user.login)"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="audit-filter-input"
          />
        </div>
        <div className="audit-filter-group">
          <label>De:</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="audit-filter-date"
          />
        </div>
        <div className="audit-filter-group">
          <label>Até:</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="audit-filter-date"
          />
        </div>
        <button type="submit" className="audit-search-btn">Buscar</button>
        <button
          type="button"
          className="audit-clear-btn"
          onClick={() => { setActionFilter(""); setFromDate(""); setToDate(""); setPage(1); }}
        >
          Limpar
        </button>
      </form>

      {/* Table */}
      <div className="audit-table-wrapper">
        {loading ? (
          <div className="audit-loading">
            <RefreshCw size={24} className="spin" />
            <span>Carregando logs…</span>
          </div>
        ) : !data || data.logs.length === 0 ? (
          <div className="audit-empty">
            <Shield size={40} opacity={0.3} />
            <p>Nenhum log encontrado para os filtros selecionados.</p>
          </div>
        ) : (
          <table className="audit-table">
            <thead>
              <tr>
                <th>Data/Hora</th>
                <th>Ação</th>
                <th>Entidade</th>
                <th>Usuário</th>
                <th>IP</th>
                <th>Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {data.logs.map((log) => (
                <>
                  <tr
                    key={log.id}
                    className={`audit-row ${expanded === log.id ? "audit-row--expanded" : ""}`}
                  >
                    <td className="audit-cell--date">{formatDate(log.createdAt)}</td>
                    <td>
                      <span
                        className="audit-action-badge"
                        style={{ borderColor: actionBadgeColor(log.action), color: actionBadgeColor(log.action) }}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td className="audit-cell--muted">
                      {log.entityType
                        ? `${log.entityType}${log.entityId ? ` #${log.entityId.slice(0, 8)}` : ""}`
                        : "—"}
                    </td>
                    <td className="audit-cell--muted">{log.userId ? log.userId.slice(0, 8) + "…" : "—"}</td>
                    <td className="audit-cell--muted">{log.ipAddress ?? "—"}</td>
                    <td>
                      {log.metadata ? (
                        <button
                          className="audit-expand-btn"
                          onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                        >
                          {expanded === log.id ? "Fechar" : "Ver"}
                        </button>
                      ) : (
                        <span className="audit-cell--muted">—</span>
                      )}
                    </td>
                  </tr>
                  {expanded === log.id && log.metadata && (
                    <tr key={`${log.id}-detail`} className="audit-row-detail">
                      <td colSpan={6}>
                        <pre className="audit-metadata">{JSON.stringify(log.metadata, null, 2)}</pre>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="audit-pagination">
          <button
            className="audit-page-btn"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft size={18} />
          </button>
          <span className="audit-page-info">
            Página {page} de {data.pages} &nbsp;·&nbsp; {data.total} registros
          </span>
          <button
            className="audit-page-btn"
            disabled={page >= data.pages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}

      {data && data.pages <= 1 && data.total > 0 && (
        <p className="audit-total-info">{data.total} registros encontrados</p>
      )}
    </div>
  );
}
