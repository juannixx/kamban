import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { checklistProgress } from "../../domain/cards";
import type { Card } from "../../domain/schema";
import { useApp } from "../context";
import { formatShortDate } from "../format";
import { PriorityBadge } from "../PriorityBadge";
import { cardBox } from "../styles";
import { cardDndId } from "./dnd";

export function CardTile({ card, inDoneColumn }: { card: Card; inDoneColumn: boolean }) {
  const openCard = useApp((s) => s.openCard);
  const today = useApp((s) => s.today);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cardDndId(card.id) });
  const progress = checklistProgress(card);
  const overdue = !inDoneColumn && card.dueDate !== undefined && card.dueDate < today;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      role="listitem"
      className={`${cardBox} cursor-grab ${isDragging ? "opacity-50" : ""}`}
    >
      <button type="button" onClick={() => openCard(card.id)} className="w-full text-left text-sm">
        {card.title}
      </button>
      {(card.dueDate || card.priority || progress.total > 0) && (
        <div className="mt-1.5 flex items-center gap-2 text-xs text-zinc-500">
          {card.dueDate && (
            <span className={overdue ? "font-medium text-red-600 dark:text-red-400" : ""}>
              {formatShortDate(card.dueDate)}
            </span>
          )}
          {card.priority && <PriorityBadge priority={card.priority} />}
          {progress.total > 0 && (
            <span>
              {progress.done}/{progress.total}
            </span>
          )}
        </div>
      )}
    </li>
  );
}
