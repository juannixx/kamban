import { useState } from "react";
import { checklistProgress } from "../../domain/cards";
import type { Card } from "../../domain/schema";
import { useApp } from "../context";
import { InlineEdit } from "../InlineEdit";
import { btn, input, sectionTitle } from "../styles";

export function ChecklistEditor({ card }: { card: Card }) {
  const addItem = useApp((s) => s.addChecklistItem);
  const toggleItem = useApp((s) => s.toggleChecklistItem);
  const renameItem = useApp((s) => s.renameChecklistItem);
  const removeItem = useApp((s) => s.removeChecklistItem);
  const moveItem = useApp((s) => s.moveChecklistItem);
  const [text, setText] = useState("");
  const progress = checklistProgress(card);
  const last = card.checklist.length - 1;

  return (
    <section aria-label="Checklist">
      <h3 className={sectionTitle}>
        {progress.total > 0 ? `Checklist (${progress.done}/${progress.total})` : "Checklist"}
      </h3>
      <ul className="mt-2 space-y-1">
        {card.checklist.map((item, index) => (
          <li key={item.id} className="flex items-center gap-1">
            <input
              type="checkbox"
              aria-label={`Marcar ${item.text}`}
              checked={item.done}
              onChange={() => toggleItem(card.id, item.id)}
            />
            <InlineEdit
              value={item.text}
              label="Texto do item"
              onSave={(value) => renameItem(card.id, item.id, value)}
              className={`flex-1 text-sm ${item.done ? "text-zinc-400 line-through" : ""}`}
            />
            <button
              type="button"
              className={btn}
              aria-label={`Subir ${item.text}`}
              disabled={index === 0}
              onClick={() => moveItem(card.id, item.id, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              className={btn}
              aria-label={`Descer ${item.text}`}
              disabled={index === last}
              onClick={() => moveItem(card.id, item.id, 1)}
            >
              ↓
            </button>
            <button
              type="button"
              className={btn}
              aria-label={`Remover ${item.text}`}
              onClick={() => removeItem(card.id, item.id)}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <input
        aria-label="Novo item do checklist"
        placeholder="Adicionar item"
        className={`${input} mt-2`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && addItem(card.id, text)) setText("");
        }}
      />
    </section>
  );
}
