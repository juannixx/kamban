import { useApp } from "./context";

export function Notice() {
  const notice = useApp((s) => s.notice);
  const dismiss = useApp((s) => s.dismissNotice);
  if (!notice) return null;
  return (
    <div
      role="status"
      className="fixed right-4 bottom-4 z-50 flex max-w-sm items-start gap-3 rounded-lg bg-zinc-900 px-4 py-3 text-sm text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900"
    >
      <p className="flex-1">{notice}</p>
      <button type="button" onClick={dismiss} aria-label="Fechar aviso" className="opacity-70 hover:opacity-100">
        ✕
      </button>
    </div>
  );
}
