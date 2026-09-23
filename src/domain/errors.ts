/** Erro de regra de negócio, com mensagem pronta para exibir ao usuário. */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

export function requireText(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed === "") throw new DomainError(`${label} não pode ficar vazio.`);
  return trimmed;
}
