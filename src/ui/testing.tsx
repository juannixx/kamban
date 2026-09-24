import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { vi } from "vitest";
import type { AgendaCache, CalendarAccount } from "../domain/agenda";
import type { KambanData } from "../domain/schema";
import { MemoryFs } from "../persistence/memoryFs";
import type { Platform } from "../platform/platform";
import { createAgendaStore, type CalendarService } from "../store/agendaStore";
import { createAppStore } from "../store/appStore";
import { fakeCalendarService, fakeClock, memoryAgendaCache, memorySettings } from "../store/testing";
import { AppProvider } from "./context";

export const DATA_DIR = "/data";

export function fakePlatform(overrides: Partial<Platform> = {}): Platform {
  return {
    pickFolder: vi.fn(async () => null),
    confirm: vi.fn(async () => true),
    revealFolder: vi.fn(async () => {}),
    openUrl: vi.fn(async () => {}),
    ...overrides,
  };
}

/** Renderiza `ui` com um store já pronto na pasta /data (quadro To-do: id-1; colunas id-2, id-3, id-4). */
export async function setupApp(
  ui: ReactElement,
  options: {
    seed?: (data: KambanData) => KambanData;
    platform?: Partial<Platform>;
    agenda?: { accounts?: CalendarAccount[]; cache?: AgendaCache | null; service?: Partial<CalendarService> };
  } = {},
) {
  const fs = new MemoryFs();
  await fs.mkdir(DATA_DIR);
  const clock = fakeClock();
  // Debounce longo: nos testes de UI nada é gravado sozinho (evita atualizações fora do act). Use flush() quando precisar.
  const store = createAppStore({ fs, settings: memorySettings(), clock, debounceMs: 60_000 });
  await store.getState().openFolder(DATA_DIR);
  if (options.seed) store.setState({ data: options.seed(store.getState().data) });
  const agendaService = fakeCalendarService(options.agenda?.service);
  const agenda = createAgendaStore({
    service: agendaService,
    settings: memorySettings(null, options.agenda?.accounts ?? []),
    cache: memoryAgendaCache(options.agenda?.cache ?? null),
    clock,
  });
  await agenda.getState().init();
  const platform = fakePlatform(options.platform);
  const user = userEvent.setup();
  const view = render(
    <AppProvider store={store} agenda={agenda} platform={platform}>
      {ui}
    </AppProvider>,
  );
  return { store, fs, clock, platform, user, agenda, agendaService, ...view };
}
