import { load } from "@tauri-apps/plugin-store";
import { parseCalendarAccounts } from "../domain/agenda";
import type { AgendaSettings } from "../store/agendaStore";
import type { Settings } from "../store/appStore";

const DATA_DIR_KEY = "dataDir";
const CALENDAR_ACCOUNTS_KEY = "calendarAccounts";

/** Configuração deste Mac (fora da pasta de dados): pasta escolhida e contas da agenda. */
export async function createTauriSettings(): Promise<Settings & AgendaSettings> {
  const store = await load("settings.json", { autoSave: false });
  return {
    async getDataDir() {
      return (await store.get<string>(DATA_DIR_KEY)) ?? null;
    },
    async setDataDir(dir) {
      await store.set(DATA_DIR_KEY, dir);
      await store.save();
    },
    async getCalendarAccounts() {
      return parseCalendarAccounts(await store.get(CALENDAR_ACCOUNTS_KEY));
    },
    async setCalendarAccounts(accounts) {
      await store.set(CALENDAR_ACCOUNTS_KEY, accounts);
      await store.save();
    },
  };
}
