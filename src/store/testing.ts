import { vi } from "vitest";
import type { AgendaCache, CalendarAccount } from "../domain/agenda";
import type { AgendaCacheStore, AgendaSettings, CalendarService, FetchRequest } from "./agendaStore";
import type { Clock, Settings } from "./appStore";

export function fakeClock(start = "2026-09-23"): Clock & { setToday(value: string): void; setNow(value: string | null): void } {
  let today = start;
  let nowOverride: string | null = null;
  let counter = 0;
  return {
    now: () => nowOverride ?? `${today}T12:00:00.000Z`,
    today: () => today,
    stamp: () => `${today}T12-00-00Z`,
    newId: () => `id-${++counter}`,
    setToday(value: string) {
      today = value;
    },
    setNow(value: string | null) {
      nowOverride = value;
    },
  };
}

export function memorySettings(
  initial: string | null = null,
  initialAccounts: CalendarAccount[] = [],
): Settings & AgendaSettings & { readonly current: string | null; readonly accounts: CalendarAccount[] } {
  let dir = initial;
  let accounts = initialAccounts;
  return {
    getDataDir: async () => dir,
    setDataDir: async (value: string) => {
      dir = value;
    },
    getCalendarAccounts: async () => accounts,
    setCalendarAccounts: async (value: CalendarAccount[]) => {
      accounts = value;
    },
    get current() {
      return dir;
    },
    get accounts() {
      return accounts;
    },
  };
}

export function fakeCalendarService(overrides: Partial<CalendarService> = {}): CalendarService {
  return {
    isConfigured: vi.fn(async () => true),
    connect: vi.fn(async () => "pessoal@gmail.com"),
    disconnect: vi.fn(async () => {}),
    listCalendars: vi.fn(async () => [{ id: "primary", name: "Pessoal", primary: true }]),
    fetchDay: vi.fn(async (requests: FetchRequest[]) => requests.map((r) => ({ email: r.email, items: [] }))),
    ...overrides,
  };
}

export function memoryAgendaCache(initial: AgendaCache | null = null): AgendaCacheStore & { readonly current: AgendaCache | null } {
  let cache = initial;
  return {
    read: async () => cache,
    write: async (value: AgendaCache) => {
      cache = value;
    },
    get current() {
      return cache;
    },
  };
}
