import { useState } from "react";
import { useApp } from "../context";
import { btn, input } from "../styles";

export function AddCardForm({ boardId, columnId }: { boardId: string; columnId: string }) {
  const addCard = useApp((s) => s.addCard);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");

  if (!open) {
    return (
      <button type="button" className={`${btn} mt-2 w-full justify-start`} onClick={() => setOpen(true)}>
        + Adicionar cartão
      </button>
    );
  }

  return (
    <input
      autoFocus
      aria-label="Título do novo cartão"
      placeholder="Título do cartão"
      className={`${input} mt-2`}
      value={title}
      onChange={(e) => setTitle(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && addCard(boardId, columnId, title)) setTitle("");
        if (e.key === "Escape") {
          setTitle("");
          setOpen(false);
        }
      }}
      onBlur={() => {
        if (title.trim() === "") setOpen(false);
      }}
    />
  );
}
