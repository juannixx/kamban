import type { Clock, Settings } from "./appStore";

export function fakeClock(start = "2026-09-23"): Clock & { setToday(value: string): void } {
  let today = start;
  let counter = 0;
  return {
    now: () => `${today}T12:00:00.000Z`,
    today: () => today,
    stamp: () => `${today}T12-00-00Z`,
    newId: () => `id-${++counter}`,
    setToday(value: string) {
      today = value;
    },
  };
}

export function memorySettings(initial: string | null = null): Settings & { readonly current: string | null } {
  let dir = initial;
  return {
    getDataDir: async () => dir,
    setDataDir: async (value: string) => {
      dir = value;
    },
    get current() {
      return dir;
    },
  };
}
