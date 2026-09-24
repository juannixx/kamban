import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAgendaStore } from "../store/agendaStore";
import { fakeCalendarService, fakeClock, memoryAgendaCache, memorySettings } from "../store/testing";
import { AGENDA_FOCUS_MIN_INTERVAL_MS, attachAgendaLifecycle } from "./agendaLifecycle";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function setup() {
  const agenda = createAgendaStore({
    service: fakeCalendarService(),
    settings: memorySettings(),
    cache: memoryAgendaCache(),
    clock: fakeClock("2026-09-24"),
  });
  let focus: ((event: { payload: boolean }) => void) | undefined;
  const win = {
    onFocusChanged: async (handler: (event: { payload: boolean }) => void) => {
      focus = handler;
    },
  };
  return { agenda, win, focus: (payload: boolean) => focus?.({ payload }) };
}

describe("attachAgendaLifecycle", () => {
  it("ao ganhar foco atualiza se os dados tiverem mais de 1 minuto", async () => {
    const { agenda, win, focus } = setup();
    const refreshIfOlderThan = vi.spyOn(agenda.getState(), "refreshIfOlderThan");
    const stop = await attachAgendaLifecycle(agenda, win);
    focus(false);
    expect(refreshIfOlderThan).not.toHaveBeenCalled();
    focus(true);
    expect(refreshIfOlderThan).toHaveBeenCalledWith(AGENDA_FOCUS_MIN_INTERVAL_MS);
    stop();
  });

  it("chama tick a cada intervalo e para ao desligar", async () => {
    const { agenda, win } = setup();
    const tick = vi.spyOn(agenda.getState(), "tick");
    const stop = await attachAgendaLifecycle(agenda, win, 1000);
    await vi.advanceTimersByTimeAsync(3000);
    expect(tick).toHaveBeenCalledTimes(3);
    stop();
    await vi.advanceTimersByTimeAsync(3000);
    expect(tick).toHaveBeenCalledTimes(3);
  });
});
