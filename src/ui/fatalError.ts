/**
 * Tela de erro fatal, sem React: usada quando o app falha antes (ou ao) montar a árvore React,
 * então não há garantia de que o React ainda consiga renderizar algo. Usa apenas DOM puro,
 * nunca innerHTML com o texto do erro, para não injetar HTML vindo da mensagem de erro.
 */
export function renderFatalError(container: HTMLElement, error: unknown): void {
  container.textContent = "";

  const wrapper = document.createElement("div");
  wrapper.className = "flex h-screen flex-col items-center justify-center gap-4 p-8 text-center";

  const heading = document.createElement("h1");
  heading.className = "text-xl font-semibold";
  heading.textContent = "Não foi possível iniciar o Kamban";

  const message = document.createElement("p");
  message.className = "max-w-md text-sm text-zinc-500";
  message.textContent =
    "Feche e abra o app de novo. Se o problema continuar, o erro abaixo ajuda a entender a causa.";

  const pre = document.createElement("pre");
  pre.className =
    "max-h-48 max-w-lg overflow-auto rounded-md bg-zinc-100 p-3 text-left text-xs whitespace-pre-wrap dark:bg-zinc-900";
  pre.textContent = String(error);

  wrapper.append(heading, message, pre);
  container.append(wrapper);
}
