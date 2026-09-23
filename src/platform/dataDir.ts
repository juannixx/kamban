function segments(path: string): string[] {
  return path.split("/").filter((part) => part !== "");
}

/**
 * A pasta de dados precisa ficar dentro da pasta pessoal (é o que o Tauri deixa acessar, `$HOME/**`),
 * ser uma subpasta dela e não passar por pastas ocultas (o escopo do Tauri não casa segmentos com ".").
 */
export function isAllowedDataDir(path: string, home: string): boolean {
  const homeParts = segments(home);
  const parts = segments(path);
  if (parts.length <= homeParts.length) return false;
  if (!homeParts.every((part, i) => parts[i] === part)) return false;
  return parts.slice(homeParts.length).every((part) => !part.startsWith("."));
}
