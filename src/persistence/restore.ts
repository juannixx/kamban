import type { KambanData } from "../domain/schema";
import { listBackups } from "./backups";
import { BACKUP_DIR, joinPath, type FileSystem } from "./fs";
import { parseData } from "./load";
import { serialize, writeAtomic } from "./save";

export type RestoreOutcome =
  | { status: "ok"; data: KambanData; mtime: number; backup: string }
  | { status: "no-backup" };

/**
 * Restaura o backup válido mais recente por cima do arquivo de dados.
 * Não passa por saveData, para não transformar o arquivo corrompido em backup.
 */
export async function restoreLatestBackup(fs: FileSystem, dir: string): Promise<RestoreOutcome> {
  for (const name of await listBackups(fs, dir)) {
    const result = parseData(await fs.readText(joinPath(dir, BACKUP_DIR, name)));
    if (result.ok) {
      const mtime = await writeAtomic(fs, dir, serialize(result.data));
      return { status: "ok", data: result.data, mtime, backup: name };
    }
  }
  return { status: "no-backup" };
}
