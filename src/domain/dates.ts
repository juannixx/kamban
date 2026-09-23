/** Converte uma Date para "YYYY-MM-DD" usando o fuso local. */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Dia da semana de uma data "YYYY-MM-DD": 0 = domingo ... 6 = sábado. */
export function weekdayOf(isoDate: string): number {
  const [y = 0, m = 1, d = 1] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}
