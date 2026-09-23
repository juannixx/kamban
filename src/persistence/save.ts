import { kambanDataSchema, type KambanData } from "../domain/schema";
import { backupIfNeeded } from "./backups";
import { DATA_FILE, joinPath, TMP_FILE, type FileSystem } from "./fs";

export function serialize(data: KambanData): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

/** Escreve no .tmp e renomeia por cima do arquivo de dados. Retorna o mtime final. */
export async function writeAtomic(fs: FileSystem, dir: string, content: string): Promise<number> {
  const tmp = joinPath(dir, TMP_FILE);
  const path = joinPath(dir, DATA_FILE);
  await fs.writeText(tmp, content);
  await fs.rename(tmp, path);
  return fs.mtime(path);
}

export async function saveData(fs: FileSystem, dir: string, data: KambanData, today: string): Promise<number> {
  const parsed = kambanDataSchema.parse(data);
  await backupIfNeeded(fs, dir, today);
  return writeAtomic(fs, dir, serialize(parsed));
}
