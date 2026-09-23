import { useState } from "react";
import { input } from "./styles";

/** Texto que vira campo ao clicar. Enter ou sair do campo salva; Esc cancela. */
export function InlineEdit({
  value,
  label,
  onSave,
  className = "",
}: {
  value: string;
  label: string;
  onSave: (value: string) => boolean;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <button
        type="button"
        title="Clique para editar"
        className={`rounded px-1 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 ${className}`}
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
      >
        {value}
      </button>
    );
  }

  function commit() {
    if (draft.trim() === value) {
      setEditing(false);
      return;
    }
    if (onSave(draft)) setEditing(false);
  }

  return (
    <input
      autoFocus
      aria-label={label}
      className={`${input} ${className}`}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}
