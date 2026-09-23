import { useState } from "react";
import { byOrder } from "../../domain/order";
import type { Board, Column } from "../../domain/schema";
import { useApp, usePlatform } from "../context";
import { btn, btnDanger, input, menuItem } from "../styles";

export function ColumnMenu({ board, column, hasCards }: { board: Board; column: Column; hasCards: boolean }) {
  const setDoneColumn = useApp((s) => s.setDoneColumn);
  const removeColumn = useApp((s) => s.removeColumn);
  const { confirm } = usePlatform();
  const others = [...board.columns].sort(byOrder).filter((c) => c.id !== column.id);
  const [choosingTarget, setChoosingTarget] = useState(false);
  const [target, setTarget] = useState(others[0]?.id ?? "");

  async function remove() {
    if (hasCards && !column.isDone) {
      setChoosingTarget(true);
      return;
    }
    if (column.isDone || (await confirm(`Remover a coluna "${column.name}"?`))) removeColumn(board.id, column.id);
  }

  return (
    <details className="relative ml-auto">
      <summary
        aria-label={`Opções da coluna ${column.name}`}
        className="cursor-pointer list-none rounded px-1.5 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800"
      >
        ⋯
      </summary>
      <div className="absolute right-0 z-10 mt-1 w-60 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
        <button
          type="button"
          className={menuItem}
          disabled={column.isDone}
          onClick={() => setDoneColumn(board.id, column.id)}
        >
          Usar como coluna de concluídos
        </button>
        {!choosingTarget ? (
          <button type="button" className={`${menuItem} text-red-600 dark:text-red-400`} onClick={() => void remove()}>
            Remover coluna
          </button>
        ) : (
          <div className="space-y-2 p-2 text-sm">
            <label className="block">
              Mover os cartões para
              <select
                aria-label="Coluna de destino"
                className={`${input} mt-1`}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                {others.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <button type="button" className={btnDanger} onClick={() => removeColumn(board.id, column.id, target)}>
                Remover e mover
              </button>
              <button type="button" className={btn} onClick={() => setChoosingTarget(false)}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
