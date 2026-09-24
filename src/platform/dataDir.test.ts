import { describe, expect, it } from "vitest";
import { isAllowedDataDir } from "./dataDir";

const HOME = "/Users/x";

describe("isAllowedDataDir", () => {
  it("aceita subpastas da pasta pessoal, inclusive no iCloud Drive", () => {
    expect(isAllowedDataDir("/Users/x/Library/Mobile Documents/com~apple~CloudDocs/Kamban", HOME)).toBe(true);
    expect(isAllowedDataDir("/Users/x/Documents/Kamban", HOME)).toBe(true);
  });

  it("ignora barras no fim do caminho e da pasta pessoal", () => {
    expect(isAllowedDataDir("/Users/x/Documents/Kamban/", HOME)).toBe(true);
    expect(isAllowedDataDir("/Users/x/Documents/Kamban", "/Users/x/")).toBe(true);
  });

  it("recusa a própria pasta pessoal", () => {
    expect(isAllowedDataDir("/Users/x", HOME)).toBe(false);
    expect(isAllowedDataDir("/Users/x/", HOME)).toBe(false);
  });

  it("recusa pastas ocultas em qualquer nível", () => {
    expect(isAllowedDataDir("/Users/x/.config/k", HOME)).toBe(false);
    expect(isAllowedDataDir("/Users/x/Documents/.segredo/k", HOME)).toBe(false);
    expect(isAllowedDataDir("/Users/x/Documents/../.ssh", HOME)).toBe(false);
  });

  it("recusa pastas fora da pasta pessoal", () => {
    expect(isAllowedDataDir("/Volumes/USB/k", HOME)).toBe(false);
    expect(isAllowedDataDir("/Users/xy/k", HOME)).toBe(false);
    expect(isAllowedDataDir("/tmp/k", HOME)).toBe(false);
  });
});
