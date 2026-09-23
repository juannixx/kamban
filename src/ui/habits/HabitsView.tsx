import { useMemo, useState, type ReactNode } from "react";
import { activeHabits } from "../../domain/habits";
import type { Habit, HabitSchedule } from "../../domain/schema";
import { useApp } from "../context";
import { InlineEdit } from "../InlineEdit";
import { SortableList } from "../SortableList";
import { btn, btnPrimary, cardBox, input } from "../styles";
import { ScheduleEditor } from "./ScheduleEditor";

export function HabitsView() {
  const data = useApp((s) => s.data);
  const reorderHabits = useApp((s) => s.reorderHabits);
  const habits = useMemo(() => activeHabits(data), [data]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <header>
        <h1 className="text-2xl font-semibold">Hábitos</h1>
        <p className="text-sm text-zinc-500">Aparecem na tela Hoje nos dias programados.</p>
      </header>
      <NewHabitForm />
      {habits.length === 0 ? (
        <p className="text-sm text-zinc-500">Nenhum hábito ainda.</p>
      ) : (
        <SortableList
          items={habits}
          onReorder={reorderHabits}
          label="Hábitos"
          renderItem={(habit, handle) => <HabitRow habit={habit} handle={handle} />}
        />
      )}
    </div>
  );
}

function HabitRow({ habit, handle }: { habit: Habit; handle: ReactNode }) {
  const updateHabit = useApp((s) => s.updateHabit);
  const archiveHabit = useApp((s) => s.archiveHabit);
  return (
    <div className={`${cardBox} flex flex-wrap items-center gap-3`}>
      {handle}
      <InlineEdit
        value={habit.title}
        label="Nome do hábito"
        onSave={(title) => updateHabit(habit.id, { title })}
        className="text-sm font-medium"
      />
      <ScheduleEditor value={habit.schedule} onChange={(schedule) => updateHabit(habit.id, { schedule })} />
      <button type="button" className={`${btn} ml-auto`} onClick={() => archiveHabit(habit.id)}>
        Arquivar
      </button>
    </div>
  );
}

function NewHabitForm() {
  const addHabit = useApp((s) => s.addHabit);
  const [title, setTitle] = useState("");
  const [schedule, setSchedule] = useState<HabitSchedule>({ type: "daily" });

  return (
    <form
      aria-label="Novo hábito"
      className={`${cardBox} flex flex-wrap items-center gap-3`}
      onSubmit={(e) => {
        e.preventDefault();
        if (addHabit(title, schedule)) {
          setTitle("");
          setSchedule({ type: "daily" });
        }
      }}
    >
      <input
        aria-label="Nome do novo hábito"
        placeholder="Novo hábito"
        className={`${input} max-w-xs`}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <ScheduleEditor value={schedule} onChange={setSchedule} />
      <button type="submit" className={btnPrimary}>
        Adicionar
      </button>
    </form>
  );
}
