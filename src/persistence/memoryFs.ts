import type { FileSystem } from "./fs";

/** FileSystem em memória para testes. */
export class MemoryFs implements FileSystem {
  files = new Map<string, { content: string; mtime: number }>();
  dirs = new Set<string>();
  failWrites = false;
  private clock = 0;

  private get(path: string) {
    const file = this.files.get(path);
    if (!file) throw new Error(`ENOENT: ${path}`);
    return file;
  }

  private checkWritable() {
    if (this.failWrites) throw new Error("EIO: write failed");
  }

  async readText(path: string) {
    return this.get(path).content;
  }

  async writeText(path: string, content: string) {
    this.checkWritable();
    this.files.set(path, { content, mtime: ++this.clock });
  }

  async rename(from: string, to: string) {
    this.checkWritable();
    const file = this.get(from);
    this.files.delete(from);
    this.files.set(to, { ...file, mtime: ++this.clock });
  }

  async exists(path: string) {
    return this.files.has(path) || this.dirs.has(path);
  }

  async mkdir(path: string) {
    this.dirs.add(path);
  }

  async list(dir: string) {
    const prefix = dir.endsWith("/") ? dir : `${dir}/`;
    return [...this.files.keys()]
      .filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/"))
      .map((p) => p.slice(prefix.length));
  }

  async remove(path: string) {
    this.files.delete(path);
  }

  async mtime(path: string) {
    return this.get(path).mtime;
  }
}
