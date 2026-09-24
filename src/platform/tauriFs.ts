import { exists, mkdir, readDir, readTextFile, remove, rename, stat, writeTextFile } from "@tauri-apps/plugin-fs";
import type { FileSystem } from "../persistence/fs";

export const tauriFs: FileSystem = {
  readText: (path) => readTextFile(path),
  writeText: (path, content) => writeTextFile(path, content),
  rename: (from, to) => rename(from, to),
  exists: (path) => exists(path),
  async mkdir(path) {
    if (!(await exists(path))) await mkdir(path, { recursive: true });
  },
  async list(dir) {
    return (await readDir(dir)).filter((entry) => entry.isFile).map((entry) => entry.name);
  },
  remove: (path) => remove(path),
  async mtime(path) {
    const info = await stat(path);
    return info.mtime ? info.mtime.getTime() : 0;
  },
};
