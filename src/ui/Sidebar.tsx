import { useMemo, useState } from "react";
import { activeBoards } from "../domain/boards";
import { useApp } from "./context";
import { SaveIndicator } from "./SaveIndicator";
import { SortableList } from "./SortableList";
import { btn, input, sectionTitle } from "./styles";

function navItem(active: boolean) {
  return `flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm ${
    active ? "bg-zinc-200 font-medium dark:bg-zinc-800" : "hover:bg-zinc-100 dark:hover:bg-zinc-900"
  }`;
}

export function Sidebar() {
  const data = useApp((s) => s.data);
  const view = useApp((s) => s.view);
  const setView = useApp((s) => s.setView);
  const addBoard = useApp((s) => s.addBoard);
  const reorderBoards = useApp((s) => s.reorderBoards);
  const boards = useMemo(() => activeBoards(data), [data]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  function closeForm() {
    setName("");
    setCreating(false);
  }

  function createBoard() {
    const id = addBoard(name);
    if (!id) return;
    closeForm();
    setView({ type: "board", boardId: id });
  }

  return (
    <nav
      aria-label="Navegação"
      className="flex w-60 shrink-0 flex-col gap-4 border-r border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40"
    >
      <div className="space-y-0.5">
        <button
          type="button"
          className={navItem(view.type === "today")}
          aria-current={view.type === "today" ? "page" : undefined}
          onClick={() => setView({ type: "today" })}
        >
          Hoje
        </button>
        <button
          type="button"
          className={navItem(view.type === "habits")}
          aria-current={view.type === "habits" ? "page" : undefined}
          onClick={() => setView({ type: "habits" })}
        >
          Hábitos
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <h2 className={`${sectionTitle} mb-1 px-2`}>Quadros</h2>
        <SortableList
          items={boards}
          onReorder={reorderBoards}
          label="Quadros"
          renderItem={(board, handle) => {
            const active = view.type === "board" && view.boardId === board.id;
            return (
              <div className="flex items-center">
                {handle}
                <button
                  type="button"
                  className={navItem(active)}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setView({ type: "board", boardId: board.id })}
                >
                  {board.name}
                </button>
              </div>
            );
          }}
        />
        {creating ? (
          <input
            autoFocus
            aria-label="Nome do novo quadro"
            placeholder="Nome do quadro"
            className={`${input} mt-1`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") createBoard();
              if (e.key === "Escape") closeForm();
            }}
            onBlur={() => {
              if (name.trim() === "") closeForm();
            }}
          />
        ) : (
          <button type="button" className={`${btn} mt-1 w-full justify-start`} onClick={() => setCreating(true)}>
            + Novo quadro
          </button>
        )}
      </div>

      <div className="space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <button
          type="button"
          className={navItem(view.type === "settings")}
          aria-current={view.type === "settings" ? "page" : undefined}
          onClick={() => setView({ type: "settings" })}
        >
          Configurações
        </button>
        <SaveIndicator />
      </div>
    </nav>
  );
}
