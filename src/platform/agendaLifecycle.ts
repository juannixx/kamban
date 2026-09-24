import type { AgendaStore } from "../store/agendaStore";
import type { LifecycleWindow } from "./windowLifecycle";

export const AGENDA_FOCUS_MIN_INTERVAL_MS = 60_000;

/** Foco: atualiza se os dados tiverem mais de 1 minuto. Timer: virada do dia e dados com mais de 15 min. */
export async function attachAgendaLifecycle(
  agenda: AgendaStore,
  win: Pick<LifecycleWindow, "onFocusChanged">,
  tickMs = 60_000,
): Promise<() => void> {
  await win.onFocusChanged(({ payload: focused }) => {
    if (focused) void agenda.getState().refreshIfOlderThan(AGENDA_FOCUS_MIN_INTERVAL_MS);
  });
  const timer = setInterval(() => {
    void agenda.getState().tick();
  }, tickMs);
  return () => clearInterval(timer);
}
