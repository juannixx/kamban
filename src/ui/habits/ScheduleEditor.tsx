import type { HabitSchedule } from "../../domain/schema";
import { WEEKDAY_INITIALS, WEEKDAY_NAMES } from "../format";
import { input } from "../styles";

export function ScheduleEditor({ value, onChange }: { value: HabitSchedule; onChange: (value: HabitSchedule) => void }) {
  const days = value.type === "custom" ? value.days : [];

  function setType(type: string) {
    if (type === "daily" || type === "weekdays") onChange({ type });
    else onChange({ type: "custom", days: [1] });
  }

  function toggleDay(day: number) {
    const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b);
    onChange({ type: "custom", days: next });
  }

  return (
    <div className="flex items-center gap-2">
      <select
        aria-label="Programação"
        className={`${input} w-auto`}
        value={value.type}
        onChange={(e) => setType(e.target.value)}
      >
        <option value="daily">Todo dia</option>
        <option value="weekdays">Dias úteis</option>
        <option value="custom">Dias específicos</option>
      </select>
      {value.type === "custom" && (
        <div role="group" aria-label="Dias da semana" className="flex gap-1">
          {WEEKDAY_INITIALS.map((initial, day) => (
            <button
              key={day}
              type="button"
              aria-label={WEEKDAY_NAMES[day]}
              aria-pressed={days.includes(day)}
              onClick={() => toggleDay(day)}
              className={`h-7 w-7 rounded-full text-xs font-medium ${
                days.includes(day)
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
              }`}
            >
              {initial}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
