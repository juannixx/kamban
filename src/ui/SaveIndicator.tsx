import { useApp } from "./context";

export function SaveIndicator() {
  const status = useApp((s) => s.saveStatus);
  const failed = useApp((s) => s.lastSaveFailed);
  const unsaved = failed || status === "error";
  const label = unsaved
    ? "Não salvo"
    : status === "saving"
      ? "Salvando…"
      : status === "pending"
        ? "Alterações pendentes"
        : "Salvo";
  return (
    <p
      role="status"
      aria-label="Status de gravação"
      className={`px-2 text-xs ${unsaved ? "font-medium text-red-600 dark:text-red-400" : "text-zinc-500"}`}
    >
      {label}
    </p>
  );
}
