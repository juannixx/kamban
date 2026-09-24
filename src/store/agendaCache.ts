import { parseAgendaCache, type AgendaCache } from "../domain/agenda";
import { joinPath, type FileSystem } from "../persistence/fs";
import type { AgendaCacheStore } from "./agendaStore";

export const AGENDA_CACHE_FILE = "calendar-cache.json";

/** Cache descartável dos eventos do dia. Nunca lança erro: sem cache, a agenda só espera a próxima atualização. */
export function createFileAgendaCache(fs: FileSystem, dir: string): AgendaCacheStore {
  const path = joinPath(dir, AGENDA_CACHE_FILE);
  return {
    async read() {
      try {
        if (!(await fs.exists(path))) return null;
        return parseAgendaCache(await fs.readText(path));
      } catch (error) {
        console.warn("Cache da agenda ilegível", error);
        return null;
      }
    },
    async write(cache: AgendaCache) {
      try {
        await fs.mkdir(dir);
        await fs.writeText(path, JSON.stringify(cache));
      } catch (error) {
        console.warn("Não foi possível gravar o cache da agenda", error);
      }
    },
  };
}
