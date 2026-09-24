import { useApp } from "./context";
import { btn, btnPrimary } from "./styles";

export function ConflictDialog() {
  const conflict = useApp((s) => s.conflict);
  const resolveConflict = useApp((s) => s.resolveConflict);
  if (!conflict) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="conflict-title"
        className="max-w-md space-y-4 rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900"
      >
        <h2 id="conflict-title" className="text-lg font-semibold">
          O arquivo mudou fora do app
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          O kamban.json foi alterado por outro programa ou por outro Mac, e há alterações suas que ainda não foram salvas.
          Qual versão manter? A outra será descartada.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" className={btn} onClick={() => void resolveConflict("disk")}>
            Usar a versão do disco
          </button>
          <button type="button" className={btnPrimary} onClick={() => void resolveConflict("app")}>
            Manter a versão do app
          </button>
        </div>
      </div>
    </div>
  );
}
