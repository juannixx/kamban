import { useState } from "react";
import { useApp } from "../context";
import { btn, input } from "../styles";

export function NewColumnForm({ boardId }: { boardId: string }) {
  const addColumn = useApp((s) => s.addColumn);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  function close() {
    setName("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button type="button" className={`${btn} w-72 shrink-0 justify-start`} onClick={() => setOpen(true)}>
        + Nova coluna
      </button>
    );
  }

  return (
    <input
      autoFocus
      aria-label="Nome da nova coluna"
      placeholder="Nome da coluna"
      className={`${input} w-72 shrink-0`}
      value={name}
      onChange={(e) => setName(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && addColumn(boardId, name)) close();
        if (e.key === "Escape") close();
      }}
      onBlur={() => {
        if (name.trim() === "") close();
      }}
    />
  );
}
