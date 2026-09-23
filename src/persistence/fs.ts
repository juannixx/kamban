/** Operações de arquivo usadas pela persistência. Caminhos absolutos com "/". */
export interface FileSystem {
  readText(path: string): Promise<string>;
  writeText(path: string, content: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  /** Cria a pasta (e as intermediárias). Não falha se já existir. */
  mkdir(path: string): Promise<void>;
  /** Nomes (não caminhos) dos arquivos diretamente dentro da pasta. */
  list(dir: string): Promise<string[]>;
  remove(path: string): Promise<void>;
  /** Data de modificação em milissegundos. */
  mtime(path: string): Promise<number>;
}

export const DATA_FILE = "kamban.json";
export const TMP_FILE = "kamban.json.tmp";
export const BACKUP_DIR = "backups";

export function joinPath(...parts: string[]): string {
  return parts.join("/").replace(/\/+/g, "/");
}
