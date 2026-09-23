import { load } from "@tauri-apps/plugin-store";
import type { Settings } from "../store/appStore";

const DATA_DIR_KEY = "dataDir";

/** Configuração do app (fora da pasta de dados), em settings.json na pasta de dados do app. */
export async function createTauriSettings(): Promise<Settings> {
  const store = await load("settings.json", { autoSave: false });
  return {
    async getDataDir() {
      return (await store.get<string>(DATA_DIR_KEY)) ?? null;
    },
    async setDataDir(dir) {
      await store.set(DATA_DIR_KEY, dir);
      await store.save();
    },
  };
}
