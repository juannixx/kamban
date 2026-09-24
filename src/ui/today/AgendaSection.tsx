import { useMemo } from "react";
import { buildAgenda, type AgendaCache, type CalendarAccount } from "../../domain/agenda";
import type { AccountStatus } from "../../store/agendaStore";
import { useAgenda, useApp } from "../context";
import { AGENDA_COLOR_CLASS } from "../format";
import { sectionTitle } from "../styles";

const pad = (n: number) => String(n).padStart(2, "0");
const clock = (iso: string) => {
  const date = new Date(iso);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export function agendaStatusText(
  accounts: readonly CalendarAccount[],
  status: Record<string, AccountStatus>,
  cache: AgendaCache | null,
  lastRefreshAt: string | null,
  refreshing: boolean,
): string {
  const revoked = accounts.find((a) => status[a.id] === "revoked");
  if (revoked) return `reconecte a conta ${revoked.email}`;
  const failed = accounts.find((a) => status[a.id] === "error");
  if (failed) return `erro na conta ${failed.email}`;
  const offline = accounts.filter((a) => status[a.id] === "offline");
  if (offline.length > 0) {
    const times = offline
      .map((a) => cache?.accounts[a.id]?.fetchedAt)
      .filter((t): t is string => t !== undefined)
      .sort();
    return times[0] ? `sem conexão · dados de ${clock(times[0])}` : "sem conexão";
  }
  if (lastRefreshAt) return `atualizada às ${clock(lastRefreshAt)}`;
  return refreshing ? "atualizando…" : "";
}

export function AgendaSection() {
  const ready = useAgenda((s) => s.ready);
  const configured = useAgenda((s) => s.configured);
  const accounts = useAgenda((s) => s.accounts);
  const cache = useAgenda((s) => s.cache);
  const status = useAgenda((s) => s.status);
  const lastRefreshAt = useAgenda((s) => s.lastRefreshAt);
  const refreshing = useAgenda((s) => s.refreshing);
  const now = useAgenda((s) => s.now);
  const refresh = useAgenda((s) => s.refresh);
  const today = useApp((s) => s.today);
  const rows = useMemo(() => buildAgenda(cache, accounts, today, new Date(now)), [cache, accounts, today, now]);

  if (!ready || (!configured && accounts.length === 0)) return null;
  const statusText = agendaStatusText(accounts, status, cache, lastRefreshAt, refreshing);

  return (
    <section aria-label="Agenda">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className={sectionTitle}>Agenda</h2>
        {accounts.length > 0 && statusText && (
          <button
            type="button"
            title="Atualizar agora"
            className="text-xs text-zinc-500 hover:underline"
            onClick={() => void refresh()}
          >
            {statusText}
          </button>
        )}
      </div>
      {accounts.length === 0 ? (
        <p className="text-sm text-zinc-500">Conecte sua agenda do Google em Configurações.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-zinc-500">Nenhum evento hoje.</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((row) => (
            <li key={row.key} className={`flex items-center gap-3 text-sm ${row.past ? "opacity-50" : ""}`}>
              <span className="w-24 shrink-0 text-xs text-zinc-500 tabular-nums">{row.timeLabel}</span>
              <span className={`flex-1 ${row.kind === "busy" ? "text-zinc-500 italic" : ""}`}>{row.title}</span>
              <span
                role="img"
                aria-label={`Conta ${row.accountEmail}`}
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${AGENDA_COLOR_CLASS[row.color]}`}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
