import { useState } from "react";
import Markdown from "react-markdown";
import type { Card } from "../../domain/schema";
import { useApp, usePlatform } from "../context";
import { toPriority } from "../format";
import { btn, btnDanger, input, sectionTitle } from "../styles";
import { ChecklistEditor } from "./ChecklistEditor";

export function CardPanel({ cardId }: { cardId: string }) {
  const data = useApp((s) => s.data);
  const card = data.cards.find((c) => c.id === cardId);
  if (!card) return null;
  const boardName = data.boards.find((b) => b.id === card.boardId)?.name ?? "";
  return <CardEditor key={card.id} card={card} boardName={boardName} />;
}

function CardEditor({ card, boardName }: { card: Card; boardName: string }) {
  const updateCard = useApp((s) => s.updateCard);
  const archiveCard = useApp((s) => s.archiveCard);
  const deleteCard = useApp((s) => s.deleteCard);
  const openCard = useApp((s) => s.openCard);
  const { confirm, openUrl } = usePlatform();
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description ?? "");
  const [preview, setPreview] = useState(false);

  function saveTitle() {
    if (title.trim() === card.title) return;
    if (!updateCard(card.id, { title })) setTitle(card.title);
  }

  function saveDescription() {
    const next = description.trim() === "" ? undefined : description;
    if (next !== card.description) updateCard(card.id, { description: next });
  }

  async function remove() {
    if (await confirm(`Excluir "${card.title}" de vez? Isso não pode ser desfeito.`)) deleteCard(card.id);
  }

  return (
    <aside
      aria-label="Detalhe do cartão"
      className="flex w-[26rem] shrink-0 flex-col border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <span className="text-xs text-zinc-500">{boardName}</span>
        <button type="button" className={btn} aria-label="Fechar detalhe" onClick={() => openCard(null)}>
          ✕
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <input
          aria-label="Título"
          className="w-full bg-transparent text-lg font-semibold outline-none"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-500">
            Prazo
            <input
              type="date"
              className={`${input} mt-1`}
              value={card.dueDate ?? ""}
              onChange={(e) => updateCard(card.id, { dueDate: e.target.value || undefined })}
            />
          </label>
          <label className="text-xs text-zinc-500">
            Prioridade
            <select
              className={`${input} mt-1`}
              value={card.priority ?? ""}
              onChange={(e) => updateCard(card.id, { priority: toPriority(e.target.value) })}
            >
              <option value="">Sem prioridade</option>
              <option value="high">Alta</option>
              <option value="medium">Média</option>
              <option value="low">Baixa</option>
            </select>
          </label>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <h3 className={sectionTitle}>Descrição</h3>
            <button
              type="button"
              className={btn}
              onClick={() => {
                if (!preview) saveDescription();
                setPreview(!preview);
              }}
            >
              {preview ? "Editar" : "Visualizar"}
            </button>
          </div>
          {preview ? (
            <div className="space-y-2 text-sm [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">
              <Markdown
                components={{
                  a: ({ href, children }) => (
                    <a
                      href={href}
                      onClick={(e) => {
                        e.preventDefault();
                        if (href) void openUrl(href);
                      }}
                    >
                      {children}
                    </a>
                  ),
                }}
              >
                {description || "_Sem descrição._"}
              </Markdown>
            </div>
          ) : (
            <textarea
              aria-label="Descrição"
              rows={8}
              className={input}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={saveDescription}
              placeholder="Markdown: **negrito**, - listas, [link](https://exemplo.com)"
            />
          )}
        </div>

        <ChecklistEditor card={card} />
      </div>

      <div className="flex justify-between border-t border-zinc-200 p-3 dark:border-zinc-800">
        <button type="button" className={btn} onClick={() => archiveCard(card.id)}>
          Arquivar
        </button>
        <button type="button" className={btnDanger} onClick={() => void remove()}>
          Excluir
        </button>
      </div>
    </aside>
  );
}
