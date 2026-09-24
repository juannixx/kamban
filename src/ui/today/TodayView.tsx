import { useMemo } from "react";
import { buildToday, type TodayCard } from "../../domain/today";
import { useApp } from "../context";
import { formatDayLabel, formatShortDate } from "../format";
import { PriorityBadge } from "../PriorityBadge";
import { cardBox, sectionTitle } from "../styles";

export function TodayView() {
  const data = useApp((s) => s.data);
  const today = useApp((s) => s.today);
  const toggleHabit = useApp((s) => s.toggleHabit);
  const completeCard = useApp((s) => s.completeCard);
  const openCard = useApp((s) => s.openCard);
  const view = useMemo(() => buildToday(data, today), [data, today]);
  const nothingDue = view.overdue.length === 0 && view.dueToday.length === 0;

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-8">
      <header>
        <h1 className="text-2xl font-semibold">Hoje</h1>
        <p className="text-sm text-zinc-500">{formatDayLabel(today)}</p>
      </header>

      <section aria-label="Rotina">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className={sectionTitle}>Rotina</h2>
          {view.habits.length > 0 && (
            <span className="text-xs text-zinc-500">
              {view.habitsDone}/{view.habits.length} feitos
            </span>
          )}
        </div>
        {view.habits.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum hábito para hoje.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {view.habits.map(({ habit, done }) => (
              <li key={habit.id}>
                <label
                  className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${
                    done
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                      : "border-zinc-200 dark:border-zinc-800"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={done}
                    onChange={() => toggleHabit(habit.id)}
                    className="accent-emerald-600"
                  />
                  {habit.title}
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <CardSection title="Atrasados" items={view.overdue} onComplete={completeCard} onOpen={openCard} overdue />
      <CardSection title="Para hoje" items={view.dueToday} onComplete={completeCard} onOpen={openCard} />
      {nothingDue && <p className="text-sm text-zinc-500">Nada com prazo para hoje.</p>}
    </div>
  );
}

function CardSection({
  title,
  items,
  onComplete,
  onOpen,
  overdue = false,
}: {
  title: string;
  items: TodayCard[];
  onComplete: (cardId: string) => boolean;
  onOpen: (cardId: string) => void;
  overdue?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <section aria-label={title}>
      <h2 className={`${sectionTitle} mb-2`}>
        {title} ({items.length})
      </h2>
      <ul className="space-y-1.5">
        {items.map(({ card, boardName }) => (
          <li key={card.id} className={`${cardBox} flex items-center gap-3`}>
            <input
              type="checkbox"
              checked={false}
              aria-label={`Concluir ${card.title}`}
              onChange={() => onComplete(card.id)}
              className="accent-emerald-600"
            />
            <button type="button" className="flex-1 text-left text-sm" onClick={() => onOpen(card.id)}>
              {card.title}
            </button>
            <span className="text-xs text-zinc-500">{boardName}</span>
            {card.dueDate && (
              <span className={`text-xs ${overdue ? "text-red-600 dark:text-red-400" : "text-zinc-500"}`}>
                {formatShortDate(card.dueDate)}
              </span>
            )}
            {card.priority && <PriorityBadge priority={card.priority} />}
          </li>
        ))}
      </ul>
    </section>
  );
}
