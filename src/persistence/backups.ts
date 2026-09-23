import { BACKUP_DIR, DATA_FILE, joinPath, type FileSystem } from "./fs";

export const BACKUPS_TO_KEEP = 14;
const BACKUP_PATTERN = /^kamban-\d{4}-\d{2}-\d{2}\.json$/;

export function backupName(date: string): string {
  return `kamban-${date}.json`;
}

/** Nomes dos backups, do mais recente para o mais antigo. */
export async function listBackups(fs: FileSystem, dir: string): Promise<string[]> {
  const backupDir = joinPath(dir, BACKUP_DIR);
  if (!(await fs.exists(backupDir))) return [];
  return (await fs.list(backupDir))
    .filter((name) => BACKUP_PATTERN.test(name))
    .sort()
    .reverse();
}

export async function rotateBackups(fs: FileSystem, dir: string, keep: number = BACKUPS_TO_KEEP): Promise<void> {
  for (const name of (await listBackups(fs, dir)).slice(keep)) {
    await fs.remove(joinPath(dir, BACKUP_DIR, name));
  }
}

/** Copia o arquivo de dados atual para o backup do dia, se ainda não existir. */
export async function backupIfNeeded(fs: FileSystem, dir: string, today: string): Promise<void> {
  const source = joinPath(dir, DATA_FILE);
  if (!(await fs.exists(source))) return;
  const backupDir = joinPath(dir, BACKUP_DIR);
  const target = joinPath(backupDir, backupName(today));
  if (await fs.exists(target)) return;
  await fs.mkdir(backupDir);
  await fs.writeText(target, await fs.readText(source));
  await rotateBackups(fs, dir);
}
