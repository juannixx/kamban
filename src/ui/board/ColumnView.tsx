import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMemo } from "react";
import { cardsInColumn } from "../../domain/cards";
import type { Board, Column } from "../../domain/schema";
import { useApp } from "../context";
import { InlineEdit } from "../InlineEdit";
import { AddCardForm } from "./AddCardForm";
import { CardTile } from "./CardTile";
import { ColumnMenu } from "./ColumnMenu";
import { cardDndId, columnDndId } from "./dnd";

export function ColumnView({ board, column }: { board: Board; column: Column }) {
  const data = useApp((s) => s.data);
  const renameColumn = useApp((s) => s.renameColumn);
  const cards = useMemo(() => cardsInColumn(data, column.id), [data, column.id]);
  const hasAnyCards = data.cards.some((c) => c.columnId === column.id);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: columnDndId(column.id),
  });

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      aria-label={`Coluna ${column.name}`}
      className={`flex w-72 shrink-0 flex-col rounded-xl bg-zinc-100 p-2 dark:bg-zinc-900 ${isDragging ? "opacity-60" : ""}`}
    >
      <div className="mb-2 flex items-center gap-1">
        <span
          {...attributes}
          {...listeners}
          aria-label={`Arrastar coluna ${column.name}`}
          className="cursor-grab px-1 text-zinc-400 select-none"
        >
          ⋮⋮
        </span>
        <InlineEdit
          value={column.name}
          label="Nome da coluna"
          onSave={(name) => renameColumn(board.id, column.id, name)}
          className="text-sm font-semibold"
        />
        <span className="text-xs text-zinc-500">{cards.length}</span>
        {column.isDone && (
          <span className="rounded bg-emerald-100 px-1.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            Concluídos
          </span>
        )}
        <ColumnMenu board={board} column={column} hasCards={hasAnyCards} />
      </div>
      <SortableContext items={cards.map((c) => cardDndId(c.id))} strategy={verticalListSortingStrategy}>
        <ul className="flex min-h-8 flex-col gap-2">
          {cards.map((card) => (
            <CardTile key={card.id} card={card} inDoneColumn={column.isDone} />
          ))}
        </ul>
      </SortableContext>
      <AddCardForm boardId={board.id} columnId={column.id} />
    </section>
  );
}
