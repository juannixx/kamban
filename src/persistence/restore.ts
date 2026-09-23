import type { KambanData } from "../domain/schema";
import { listBackups } from "./backups";
import { BACKUP_DIR, DATA_FILE, joinPath, type FileSystem } from "./fs";
import { parseData } from "./load";
import { serialize, writeAtomic } from "./save";

export type RestoreOutcome =
  | { status: "ok"; data: KambanData; mtime: number; backup: string }
  | { status: "no-backup" };

/**
 * Copia o arquivo de dados atual (possivelmente corrompido) para a quarentena, se existir.
 * O nome não deve bater com o padrão de backup diário, para a rotação nunca apagá-lo.
 */
async function quarantineCurrentFile(fs: FileSystem, dir: string, stamp: string): Promise<void> {
  const source = joinPath(dir, DATA_FILE);
  if (!(await fs.exists(source))) return;
  const backupDir = joinPath(dir, BACKUP_DIR);
  await fs.mkdir(backupDir);
  await fs.writeText(joinPath(backupDir, `kamban-quarentena-${stamp}.json`), await fs.readText(source));
}

/**
 * Restaura o backup válido mais recente por cima do arquivo de dados.
 * Não passa por saveData, para não transformar o arquivo corrompido em backup.
 * Antes de sobrescrever, coloca o arquivo atual (se existir) em quarentena com o `stamp` dado.
 */
export async function restoreLatestBackup(fs: FileSystem, dir: string, stamp: string): Promise<RestoreOutcome> {
  for (const name of await listBackups(fs, dir)) {
    const result = parseData(await fs.readText(joinPath(dir, BACKUP_DIR, name)));
    if (result.ok) {
      await quarantineCurrentFile(fs, dir, stamp);
      const mtime = await writeAtomic(fs, dir, serialize(result.data));
      return { status: "ok", data: result.data, mtime, backup: name };
    }
  }
  return { status: "no-backup" };
}
