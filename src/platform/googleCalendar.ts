import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { agendaItemSchema } from "../domain/agenda";
import { toAgendaError, type CalendarInfo, type CalendarService, type FetchResult } from "../store/agendaStore";

const itemsSchema = z.array(agendaItemSchema);

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw toAgendaError(error);
  }
}

export const tauriCalendarService: CalendarService = {
  isConfigured: () => call<boolean>("google_is_configured").catch(() => false),

  async connect(mode) {
    const result = await call<{ email: string }>("google_connect", { mode });
    return result.email;
  },

  disconnect: (email) => call<void>("google_disconnect", { email }),

  listCalendars: (email) => call<CalendarInfo[]>("google_list_calendars", { email }),

  async fetchDay(requests, dayStart, dayEnd) {
    const raw = await call<{ email: string; items?: unknown; error?: unknown }[]>("google_fetch_day", {
      accounts: requests,
      dayStart,
      dayEnd,
    });
    return raw.map((result): FetchResult => {
      if (result.error !== undefined) return { email: result.email, error: toAgendaError(result.error) };
      const items = itemsSchema.safeParse(result.items ?? []);
      return items.success
        ? { email: result.email, items: items.data }
        : { email: result.email, error: { kind: "other", message: "Resposta inesperada da agenda." } };
    });
  },
};
