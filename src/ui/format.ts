import type { AgendaColor } from "../domain/agenda";
import { weekdayOf } from "../domain/dates";
import { prioritySchema, type Priority } from "../domain/schema";

const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export const WEEKDAY_NAMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
export const WEEKDAY_INITIALS = ["D", "S", "T", "Q", "Q", "S", "S"];

export function formatShortDate(iso: string): string {
  const [, month = "", day = ""] = iso.split("-");
  return `${day}/${month}`;
}

export function formatDayLabel(iso: string): string {
  return `${WEEKDAY_SHORT[weekdayOf(iso)]}, ${formatShortDate(iso)}`;
}

export const PRIORITY_LABEL: Record<Priority, string> = { high: "Alta", medium: "Média", low: "Baixa" };

export const PRIORITY_CLASS: Record<Priority, string> = {
  high: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  low: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
};

export function toPriority(value: string): Priority | undefined {
  const result = prioritySchema.safeParse(value);
  return result.success ? result.data : undefined;
}

export const AGENDA_COLOR_CLASS: Record<AgendaColor, string> = {
  sky: "bg-sky-500",
  violet: "bg-violet-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  teal: "bg-teal-500",
};

export const AGENDA_COLOR_NAME: Record<AgendaColor, string> = {
  sky: "Azul",
  violet: "Roxo",
  emerald: "Verde",
  amber: "Amarelo",
  rose: "Rosa",
  teal: "Turquesa",
};
