import { z } from "zod";
import { CURRENT_VERSION, kambanDataSchema, type KambanData } from "../domain/schema";
import { DATA_FILE, joinPath, type FileSystem } from "./fs";

export type LoadError = "invalid-json" | "invalid-schema" | "future-version";

export type ParseResult = { ok: true; data: KambanData } | { ok: false; error: LoadError; message: string };

export type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/** Chave = versão de origem. Cada migração devolve o objeto na versão seguinte. */
export const MIGRATIONS: Record<number, Migration> = {};

export type LoadOutcome =
  | { status: "no-folder" }
  | { status: "missing" }
  | { status: "ok"; data: KambanData; mtime: number }
  | { status: "error"; error: LoadError; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function migrate(
  raw: unknown,
  migrations: Record<number, Migration> = MIGRATIONS,
  current: number = CURRENT_VERSION,
): unknown {
  if (!isRecord(raw) || typeof raw.version !== "number") return raw;
  let value = raw;
  while (typeof value.version === "number" && value.version < current) {
    const step = migrations[value.version];
    if (!step) break;
    value = step(value);
  }
  return value;
}

export function parseData(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: "invalid-json", message: String(error) };
  }

  if (isRecord(raw) && typeof raw.version === "number" && raw.version > CURRENT_VERSION) {
    return {
      ok: false,
      error: "future-version",
      message: `O arquivo está na versão ${raw.version}, mas este app só lê até a versão ${CURRENT_VERSION}. Atualize o app.`,
    };
  }

  const result = kambanDataSchema.safeParse(migrate(raw));
  if (!result.success) {
    return { ok: false, error: "invalid-schema", message: z.prettifyError(result.error) };
  }
  return { ok: true, data: result.data };
}

export async function loadData(fs: FileSystem, dir: string): Promise<LoadOutcome> {
  if (!(await fs.exists(dir))) return { status: "no-folder" };
  const path = joinPath(dir, DATA_FILE);
  if (!(await fs.exists(path))) return { status: "missing" };

  const result = parseData(await fs.readText(path));
  if (!result.ok) return { status: "error", error: result.error, message: result.message };
  return { status: "ok", data: result.data, mtime: await fs.mtime(path) };
}
