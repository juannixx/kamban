import { z } from "zod";
import { toISODate } from "./dates";

export const AGENDA_COLORS = ["sky", "violet", "emerald", "amber", "rose", "teal"] as const;
export type AgendaColor = (typeof AGENDA_COLORS)[number];

export const accountModeSchema = z.enum(["details", "busy"]);
export type AccountMode = z.infer<typeof accountModeSchema>;

export const calendarAccountSchema = z.object({
  id: z.string().min(1),
  email: z.string().min(1),
  mode: accountModeSchema,
  color: z.enum(AGENDA_COLORS),
  calendars: z.array(z.object({ id: z.string().min(1), name: z.string(), selected: z.boolean() })),
});
export type CalendarAccount = z.infer<typeof calendarAccountSchema>;

export const agendaItemSchema = z.object({
  kind: z.enum(["event", "busy"]),
  title: z.string().optional(),
  start: z.string().min(1),
  end: z.string().min(1),
  allDay: z.boolean(),
});
export type AgendaItem = z.infer<typeof agendaItemSchema>;

export const agendaCacheSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  accounts: z.record(z.string(), z.object({ fetchedAt: z.string(), items: z.array(agendaItemSchema) })),
});
export type AgendaCache = z.infer<typeof agendaCacheSchema>;

export function parseCalendarAccounts(value: unknown): CalendarAccount[] {
  const result = z.array(calendarAccountSchema).safeParse(value);
  return result.success ? result.data : [];
}

export function parseAgendaCache(text: string): AgendaCache | null {
  try {
    const result = agendaCacheSchema.safeParse(JSON.parse(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function nextColor(accounts: readonly CalendarAccount[]): AgendaColor {
  const used = new Set(accounts.map((a) => a.color));
  return AGENDA_COLORS.find((c) => !used.has(c)) ?? AGENDA_COLORS[accounts.length % AGENDA_COLORS.length] ?? "sky";
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Data em ISO 8601 no horário local, com o deslocamento do fuso (ex.: 2026-09-24T00:00:00-03:00). */
export function toLocalIsoString(date: Date): string {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return `${day}T${time}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** Limites do dia local: da meia-noite de `isoDate` até a meia-noite seguinte. */
export function dayBounds(isoDate: string): { start: string; end: string } {
  const [y = 0, m = 1, d = 1] = isoDate.split("-").map(Number);
  return { start: toLocalIsoString(new Date(y, m - 1, d)), end: toLocalIsoString(new Date(y, m - 1, d + 1)) };
}

/** Une blocos "busy" que se tocam ou se sobrepõem. Eventos são ignorados. */
export function mergeBusy(items: readonly AgendaItem[]): AgendaItem[] {
  const sorted = items.filter((i) => i.kind === "busy").sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const merged: AgendaItem[] = [];
  for (const item of sorted) {
    const last = merged.at(-1);
    if (last && Date.parse(item.start) <= Date.parse(last.end)) {
      if (Date.parse(item.end) > Date.parse(last.end)) merged[merged.length - 1] = { ...last, end: item.end };
    } else {
      merged.push({ ...item });
    }
  }
  return merged;
}

export interface AgendaRow {
  key: string;
  accountId: string;
  accountEmail: string;
  color: AgendaColor;
  kind: "event" | "busy";
  title: string;
  timeLabel: string;
  allDay: boolean;
  past: boolean;
}

const formatTime = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
const formatDayMonth = (date: Date) => `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;

/** Linhas da seção Agenda da tela Hoje, já ordenadas. */
export function buildAgenda(
  cache: AgendaCache | null,
  accounts: readonly CalendarAccount[],
  today: string,
  now: Date,
): AgendaRow[] {
  if (!cache || cache.date !== today) return [];
  const dayEnd = Date.parse(dayBounds(today).end);
  const rows: { row: AgendaRow; start: number; end: number; accountIndex: number }[] = [];

  accounts.forEach((account, accountIndex) => {
    const entry = cache.accounts[account.id];
    if (!entry) return;
    // COMP-04: conta em "Só horários" nunca mostra eventos com título, mesmo que o cache tenha algum.
    const events = account.mode === "busy" ? [] : entry.items.filter((i) => i.kind === "event");
    const items = [...events, ...mergeBusy(entry.items)];
    items.forEach((item, index) => {
      const key = `${account.id}:${item.kind}:${item.start}:${index}`;
      const base = { key, accountId: account.id, accountEmail: account.email, color: account.color, kind: item.kind };
      if (item.allDay) {
        rows.push({
          row: { ...base, title: item.title ?? "(sem título)", timeLabel: "Dia todo", allDay: true, past: false },
          start: Number.NEGATIVE_INFINITY,
          end: Number.NEGATIVE_INFINITY,
          accountIndex,
        });
        return;
      }
      const start = new Date(item.start);
      const end = new Date(item.end);
      const timeLabel = toISODate(start) === today ? formatTime(start) : `${formatDayMonth(start)} ${formatTime(start)}`;
      const title =
        item.kind === "busy"
          ? `Ocupado (até ${end.getTime() >= dayEnd ? "o fim do dia" : formatTime(end)})`
          : (item.title ?? "(sem título)");
      rows.push({
        row: { ...base, title, timeLabel, allDay: false, past: end.getTime() <= now.getTime() },
        start: start.getTime(),
        end: end.getTime(),
        accountIndex,
      });
    });
  });

  rows.sort((a, b) => {
    if (a.row.allDay !== b.row.allDay) return a.row.allDay ? -1 : 1;
    if (a.row.allDay) return a.row.title.localeCompare(b.row.title, "pt-BR") || a.accountIndex - b.accountIndex;
    return a.start - b.start || a.end - b.end || a.accountIndex - b.accountIndex;
  });
  return rows.map((r) => r.row);
}
