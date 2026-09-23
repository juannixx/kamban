import {
  closestCorners,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { horizontalListSortingStrategy, SortableContext, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useMemo } from "react";
import { boardColumns } from "../../domain/columns";
import type { Board } from "../../domain/schema";
import { useApp, usePlatform } from "../context";
import { InlineEdit } from "../InlineEdit";
import { btn } from "../styles";
import { ColumnView } from "./ColumnView";
import { columnDndId, parseDndId, resolveCardDrop, resolveColumnDrop } from "./dnd";
import { NewColumnForm } from "./NewColumnForm";

export function BoardView({ boardId }: { boardId: string }) {
  const data = useApp((s) => s.data);
  const moveCard = useApp((s) => s.moveCard);
  const reorderColumns = useApp((s) => s.reorderColumns);
  const board = data.boards.find((b) => b.id === boardId);
  const columns = useMemo(() => (board ? boardColumns(board) : []), [board]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!board) return <p className="p-8 text-sm text-zinc-500">Quadro não encontrado.</p>;

  function handleDragEnd({ active, over }: DragEndEvent) {
    const source = parseDndId(active.id);
    if (!source || !board) return;
    const overId = over?.id ?? null;
    if (source.type === "card") {
      const drop = resolveCardDrop(data, source.id, overId);
      if (drop) moveCard(source.id, drop.toColumnId, drop.toIndex);
      return;
    }
    const ids = resolveColumnDrop(
      data,
      columns.map((c) => c.id),
      source.id,
      overId,
    );
    if (ids) reorderColumns(board.id, ids);
  }

  return (
    <div className="flex h-full flex-col">
      <BoardHeader board={board} />
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
        <SortableContext items={columns.map((c) => columnDndId(c.id))} strategy={horizontalListSortingStrategy}>
          <div className="flex flex-1 items-start gap-4 overflow-x-auto p-6">
            {columns.map((column) => (
              <ColumnView key={column.id} board={board} column={column} />
            ))}
            <NewColumnForm boardId={board.id} />
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function BoardHeader({ board }: { board: Board }) {
  const renameBoard = useApp((s) => s.renameBoard);
  const archiveBoard = useApp((s) => s.archiveBoard);
  const { confirm } = usePlatform();

  async function archive() {
    if (await confirm(`Arquivar o quadro "${board.name}"? Os cartões continuam guardados no arquivo de dados.`)) {
      archiveBoard(board.id);
    }
  }

  return (
    <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
      <InlineEdit
        value={board.name}
        label="Nome do quadro"
        onSave={(name) => renameBoard(board.id, name)}
        className="text-xl font-semibold"
      />
      <button type="button" className={btn} onClick={() => void archive()}>
        Arquivar quadro
      </button>
    </header>
  );
}
