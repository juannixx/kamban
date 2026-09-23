# Kamban Fase 2 (App) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o núcleo da Fase 1 no app de verdade: shell Tauri 2 para macOS, adaptadores de plataforma (arquivos, configuração, diálogos, janela), store Zustand com o ciclo de vida dos dados, todas as telas da spec (Hoje, Quadro com arrastar e soltar, Detalhe do cartão, Hábitos, Configurações, primeira abertura, erro de arquivo, conflito) e o workflow que publica o `.dmg` a cada tag.

**Architecture:** `src/store/appStore.ts` é o único ponto que junta domain, persistence e relógio: recebe `FileSystem`, `Settings` e `Clock` por injeção (em testes: `MemoryFs`, `memorySettings`, `fakeClock`). A UI (`src/ui/`) só lê e chama o store via `useApp` e usa `Platform` (diálogos, Finder, links) via `usePlatform`; nunca importa Tauri. `src/platform/` contém as únicas importações de `@tauri-apps/*`. `src/main.tsx` monta tudo.

**Tech Stack:** Tauri 2.11 (plugins fs, dialog, store, opener), React 19, Zustand 5, dnd-kit (core 6, sortable 10), Tailwind CSS 4 (`@tailwindcss/vite`), react-markdown 10, Vitest 5 + jsdom + React Testing Library + user-event.

**Spec:** `docs/superpowers/specs/2026-09-23-kamban-design.md` (seções 4, 5, 6 e 8 são as desta fase)

## Global Constraints

- Somente `src/platform/*` e `src/main.tsx` importam `@tauri-apps/*`. `src/ui/*` e `src/store/*` nunca importam Tauri.
- `src/domain/*` continua puro. Novas regras de negócio (checklist) vão para `src/domain/`.
- Seletores do Zustand devolvem só valores estáveis (um campo do estado ou uma ação). Nunca `useApp(s => buildToday(...))` ou `useApp(s => s.data.boards.filter(...))`: isso cria objeto novo a cada leitura e trava o React. Derive com `useMemo` a partir de `useApp(s => s.data)`.
- Ações do store que alteram dados devolvem `boolean` (ou `string | null` quando criam algo): `false`/`null` quando o domínio recusou (`DomainError`), com a mensagem em `notice`.
- Arquivos de teste de UI são `*.test.tsx`, começam com a linha `// @vitest-environment jsdom` e chamam `afterEach(cleanup)`. Depois de uma ação que dispara trabalho assíncrono no store, a verificação usa `findBy*` ou `waitFor` do Testing Library.
- Textos da interface em português do Brasil. Datas exibidas como `DD/MM`.
- Estilo: Tailwind com a paleta `zinc`, tema claro e escuro seguindo o macOS (variante `dark:` padrão do Tailwind 4). Classes compartilhadas ficam em `src/ui/styles.ts`.
- Identificador do app: `com.juannixx.kamban`. Nome: `Kamban`. Versão inicial: `0.1.0`. Janela: 1280x800, mínimo 900x600.
- Acesso a arquivos do Tauri restrito a `$HOME/**`.
- Nunca commitar na `main`. Toda a Fase 2 é feita na branch `feat/fase-2-app` e entregue num único PR.
- Toda mensagem de commit termina com uma linha em branco seguida do trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` (fora do assunto; omitido nos exemplos por brevidade).
- Antes de cada commit: `pnpm test && pnpm typecheck && pnpm lint`.
- Nos testes de UI, `setupApp` cria o store com debounce de 60 s: nada é gravado sozinho durante o teste. Quando o teste precisar do arquivo gravado, use `await act(async () => { await store.getState().flush(); })`.

## Fora desta fase

Busca, atalhos avançados, seletor manual de tema, streaks, etiquetas, assinatura Apple com certificado, ícone próprio do app (usa o ícone padrão do `tauri init`), `deleteBoard`/`deleteHabit` (a spec só pede excluir de vez no cartão), uso simultâneo em dois Macs.

## File Structure

```
src-tauri/                      criado pelo `tauri init` (Cargo.toml, tauri.conf.json, src/lib.rs, capabilities/default.json, icons/)
.github/workflows/release.yml   build universal do macOS e GitHub Release a cada tag v*
vite.config.ts                  + Tailwind, config recomendada do Tauri
src/
  main.tsx                      monta adaptadores, store, ciclo da janela e React
  index.css                     Tailwind
  domain/checklist.ts           regras do checklist (novo)
  store/
    appStore.ts                 createAppStore, tipos AppState/AppActions/Settings/Clock/View
    testing.ts                  fakeClock, memorySettings
  platform/
    platform.ts                 interface Platform (usada pela UI)
    tauriFs.ts                  FileSystem sobre @tauri-apps/plugin-fs
    settings.ts                 Settings sobre @tauri-apps/plugin-store
    clock.ts                    systemClock
    tauriPlatform.ts            Platform sobre dialog + opener
    windowLifecycle.ts          fechar com flush, foco, virada do dia
  ui/
    context.tsx                 AppProvider, useApp, usePlatform
    styles.ts                   classes Tailwind compartilhadas
    format.ts                   datas e rótulos de prioridade
    testing.tsx                 setupApp, fakePlatform (helpers de teste)
    App.tsx                     escolhe a tela pela fase
    Centered.tsx, Notice.tsx, InlineEdit.tsx, PriorityBadge.tsx, SortableList.tsx
    screens/ChooseFolder.tsx, screens/LoadErrorScreen.tsx
    Shell.tsx, Sidebar.tsx, SaveIndicator.tsx, ConflictDialog.tsx
    today/TodayView.tsx
    board/dnd.ts, board/BoardView.tsx, board/ColumnView.tsx, board/ColumnMenu.tsx,
    board/CardTile.tsx, board/AddCardForm.tsx, board/NewColumnForm.tsx
    card/CardPanel.tsx, card/ChecklistEditor.tsx
    habits/HabitsView.tsx, habits/ScheduleEditor.tsx
    settings/SettingsView.tsx
```
`src/App.tsx` (placeholder da Fase 1) é removido.

---

### Task 1: Shell Tauri e workflow de release

**Files:**
- Create: `src-tauri/**` (via `tauri init` e `tauri add`), `.github/workflows/release.yml`
- Modify: `package.json` (scripts, dependências, versão), `vite.config.ts`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`

**Interfaces:**
- Produces: `pnpm tauri dev`, `pnpm tauri build`; dependências `@tauri-apps/api`, `@tauri-apps/plugin-fs`, `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-store`, `@tauri-apps/plugin-opener` instaladas e liberadas nas capabilities.

- [ ] **Step 1: Instalar o Rust (só na máquina local; o CI tem o seu)**

```bash
xcode-select -p   # deve imprimir um caminho; se falhar, pare e reporte BLOCKED
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
source "$HOME/.cargo/env"
rustc -V && cargo -V
```
Expected: versões do `rustc` e do `cargo`. Em todos os passos seguintes que usam `pnpm tauri`, rode antes `source "$HOME/.cargo/env"` no mesmo comando.

- [ ] **Step 2: Instalar o CLI e a API do Tauri e criar o `src-tauri`**

```bash
pnpm add -D @tauri-apps/cli@^2.11
pnpm add @tauri-apps/api@^2.11
pnpm pkg set scripts.tauri="tauri" version="0.1.0"
source "$HOME/.cargo/env" && pnpm tauri init --ci -A "Kamban" -W "Kamban" -D "../dist" -P "http://localhost:5173" --before-dev-command "pnpm dev" --before-build-command "pnpm build"
```
Expected: pasta `src-tauri/` com `Cargo.toml`, `build.rs`, `tauri.conf.json`, `src/main.rs`, `src/lib.rs`, `icons/`, `capabilities/default.json`.

- [ ] **Step 3: Adicionar os plugins**

```bash
source "$HOME/.cargo/env"
pnpm tauri add fs
pnpm tauri add dialog
pnpm tauri add store
pnpm tauri add opener
```
Depois confira que `src-tauri/src/lib.rs` registra os quatro plugins. O `run()` deve ficar assim (ajuste à mão se o `tauri add` não tiver editado):
```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```
Se o `tauri init` tiver gerado um bloco `.setup(...)` com `tauri_plugin_log` dentro de `if cfg!(debug_assertions)`, pode mantê-lo.

- [ ] **Step 4: Configurar `src-tauri/tauri.conf.json`**

Substitua o arquivo por este conteúdo, mantendo o array `bundle.icon` exatamente como o `tauri init` gerou (copie-o do arquivo antigo para o lugar marcado):
```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Kamban",
  "version": "0.1.0",
  "identifier": "com.juannixx.kamban",
  "build": {
    "beforeDevCommand": "pnpm dev",
    "beforeBuildCommand": "pnpm build",
    "devUrl": "http://localhost:5173",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      { "title": "Kamban", "width": 1280, "height": 800, "minWidth": 900, "minHeight": 600 }
    ],
    "security": { "csp": null }
  },
  "bundle": {
    "active": true,
    "targets": ["app", "dmg"],
    "icon": ["<<< COPIAR DO ARQUIVO GERADO >>>"],
    "macOS": { "signingIdentity": "-" }
  }
}
```
`signingIdentity: "-"` é a assinatura ad-hoc: evita que o macOS em Apple Silicon diga que o app baixado está "danificado". O aviso de desenvolvedor não identificado continua aparecendo na primeira abertura.

- [ ] **Step 5: Escrever `src-tauri/capabilities/default.json`**

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Permissões da janela principal do Kamban",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:window:allow-close",
    "core:window:allow-destroy",
    "dialog:default",
    "store:default",
    "opener:default",
    { "identifier": "fs:allow-read-text-file", "allow": [{ "path": "$HOME/**" }] },
    { "identifier": "fs:allow-write-text-file", "allow": [{ "path": "$HOME/**" }] },
    { "identifier": "fs:allow-rename", "allow": [{ "path": "$HOME/**" }] },
    { "identifier": "fs:allow-exists", "allow": [{ "path": "$HOME/**" }] },
    { "identifier": "fs:allow-mkdir", "allow": [{ "path": "$HOME/**" }] },
    { "identifier": "fs:allow-read-dir", "allow": [{ "path": "$HOME/**" }] },
    { "identifier": "fs:allow-remove", "allow": [{ "path": "$HOME/**" }] },
    { "identifier": "fs:allow-stat", "allow": [{ "path": "$HOME/**" }] }
  ]
}
```
`core:window:allow-destroy` é obrigatório: com um listener de fechamento registrado, quem fecha a janela é o JavaScript (via `destroy()`). Sem essa permissão o botão vermelho deixa de funcionar.

- [ ] **Step 6: Ajustar o `vite.config.ts` para o Tauri**

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target: "safari16",
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
```

- [ ] **Step 7: Compilar o app para validar o shell**

```bash
pnpm test && pnpm typecheck && pnpm lint && pnpm build
source "$HOME/.cargo/env" && pnpm tauri build --debug --bundles app
ls src-tauri/target/debug/bundle/macos/
```
Expected: testes, typecheck, lint e build verdes; `Kamban.app` listado. A primeira compilação do Rust leva vários minutos. Se falhar, investigue a mensagem de erro antes de mudar qualquer configuração.

- [ ] **Step 8: Criar `.github/workflows/release.yml`**

```yaml
name: Release

on:
  push:
    tags: ["v*"]

jobs:
  release:
    runs-on: macos-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: aarch64-apple-darwin,x86_64-apple-darwin
      - uses: swatinem/rust-cache@v2
        with:
          workspaces: "./src-tauri -> target"
      - run: pnpm install --frozen-lockfile
      - uses: tauri-apps/tauri-action@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: "Kamban ${{ github.ref_name }}"
          releaseBody: "Baixe o arquivo .dmg abaixo. Na primeira abertura, clique com o botão direito no app e escolha Abrir (o app não tem assinatura da Apple)."
          releaseDraft: false
          prerelease: false
          args: --target universal-apple-darwin
```

- [ ] **Step 9: Commit**

Confira com `git status` que `src-tauri/target/` não aparece (já está no `.gitignore`). `src-tauri/gen/schemas/` deve ser commitado.
```bash
git add -A
git commit -m "chore(tauri): shell Tauri 2 com plugins fs, dialog, store e opener, e workflow de release"
```

---

### Task 2: Regras do checklist no domínio

**Files:**
- Create: `src/domain/checklist.ts`
- Test: `src/domain/checklist.test.ts`

**Interfaces:**
- Consumes: `DomainError`, `requireText` (`src/domain/errors.ts`); `ChecklistItem` (`src/domain/schema.ts`).
- Produces (todas puras, devolvem um array novo):
  - `addChecklistItem(items: readonly ChecklistItem[], id: string, text: string): ChecklistItem[]`
  - `toggleChecklistItem(items: readonly ChecklistItem[], id: string): ChecklistItem[]`
  - `renameChecklistItem(items: readonly ChecklistItem[], id: string, text: string): ChecklistItem[]`
  - `removeChecklistItem(items: readonly ChecklistItem[], id: string): ChecklistItem[]`
  - `moveChecklistItem(items: readonly ChecklistItem[], id: string, delta: -1 | 1): ChecklistItem[]`

- [ ] **Step 1: Escrever o teste que falha**

`src/domain/checklist.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  addChecklistItem,
  moveChecklistItem,
  removeChecklistItem,
  renameChecklistItem,
  toggleChecklistItem,
} from "./checklist";
import { DomainError } from "./errors";
import type { ChecklistItem } from "./schema";

const items: ChecklistItem[] = [
  { id: "a", text: "Um", done: false },
  { id: "b", text: "Dois", done: true },
  { id: "c", text: "Três", done: false },
];
const ids = (list: ChecklistItem[]) => list.map((i) => i.id);

describe("addChecklistItem", () => {
  it("adiciona no fim, não feito, com texto sem espaços nas pontas", () => {
    expect(addChecklistItem(items, "d", "  Quatro ").at(-1)).toEqual({ id: "d", text: "Quatro", done: false });
  });

  it("rejeita texto vazio", () => {
    expect(() => addChecklistItem(items, "d", "  ")).toThrow(DomainError);
  });
});

describe("toggleChecklistItem / renameChecklistItem / removeChecklistItem", () => {
  it("alterna, renomeia e remove sem alterar a lista original", () => {
    expect(toggleChecklistItem(items, "a")[0]!.done).toBe(true);
    expect(renameChecklistItem(items, "b", " Dois! ")[1]!.text).toBe("Dois!");
    expect(ids(removeChecklistItem(items, "b"))).toEqual(["a", "c"]);
    expect(ids(items)).toEqual(["a", "b", "c"]);
  });

  it("rejeita item inexistente e texto vazio", () => {
    expect(() => toggleChecklistItem(items, "x")).toThrow(DomainError);
    expect(() => removeChecklistItem(items, "x")).toThrow(DomainError);
    expect(() => renameChecklistItem(items, "a", "")).toThrow(DomainError);
  });
});

describe("moveChecklistItem", () => {
  it("sobe e desce uma posição", () => {
    expect(ids(moveChecklistItem(items, "c", -1))).toEqual(["a", "c", "b"]);
    expect(ids(moveChecklistItem(items, "a", 1))).toEqual(["b", "a", "c"]);
  });

  it("não sai dos limites", () => {
    expect(ids(moveChecklistItem(items, "a", -1))).toEqual(["a", "b", "c"]);
    expect(ids(moveChecklistItem(items, "c", 1))).toEqual(["a", "b", "c"]);
  });

  it("rejeita item inexistente", () => {
    expect(() => moveChecklistItem(items, "x", 1)).toThrow(DomainError);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/domain/checklist.test.ts`
Expected: FAIL, `Failed to resolve import "./checklist"`

- [ ] **Step 3: Implementar**

`src/domain/checklist.ts`:
```ts
import { DomainError, requireText } from "./errors";
import type { ChecklistItem } from "./schema";

function indexOfItem(items: readonly ChecklistItem[], id: string): number {
  const index = items.findIndex((i) => i.id === id);
  if (index === -1) throw new DomainError(`Item do checklist não encontrado: ${id}`);
  return index;
}

export function addChecklistItem(items: readonly ChecklistItem[], id: string, text: string): ChecklistItem[] {
  return [...items, { id, text: requireText(text, "O item do checklist"), done: false }];
}

export function toggleChecklistItem(items: readonly ChecklistItem[], id: string): ChecklistItem[] {
  indexOfItem(items, id);
  return items.map((i) => (i.id === id ? { ...i, done: !i.done } : i));
}

export function renameChecklistItem(items: readonly ChecklistItem[], id: string, text: string): ChecklistItem[] {
  indexOfItem(items, id);
  const trimmed = requireText(text, "O item do checklist");
  return items.map((i) => (i.id === id ? { ...i, text: trimmed } : i));
}

export function removeChecklistItem(items: readonly ChecklistItem[], id: string): ChecklistItem[] {
  indexOfItem(items, id);
  return items.filter((i) => i.id !== id);
}

export function moveChecklistItem(items: readonly ChecklistItem[], id: string, delta: -1 | 1): ChecklistItem[] {
  const index = indexOfItem(items, id);
  const target = index + delta;
  const next = [...items];
  if (target < 0 || target >= items.length) return next;
  const [item] = next.splice(index, 1);
  if (item) next.splice(target, 0, item);
  return next;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test src/domain && pnpm typecheck && pnpm lint`
Expected: todos passam; sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/domain/checklist.ts src/domain/checklist.test.ts
git commit -m "feat(domain): regras do checklist do cartão"
```

---
### Task 3: Store do app (ciclo de vida dos dados)

**Files:**
- Create: `src/store/appStore.ts`, `src/store/testing.ts`
- Test: `src/store/appStore.test.ts`
- Modify: `package.json` (dependência `zustand`)

**Interfaces:**
- Consumes (Fase 1): `createEmptyData`, `createInitialData`, `addBoard`, `renameBoard`, `archiveBoard`, `reorderBoards` (`domain/boards`); `addCard`, `updateCard`, `moveCard`, `completeCard`, `archiveCard`, `deleteCard`, `getCard`, `CardPatch` (`domain/cards`); `addColumn`, `renameColumn`, `setDoneColumn`, `removeColumn`, `reorderColumns` (`domain/columns`); `addHabit`, `updateHabit`, `archiveHabit`, `reorderHabits`, `toggleHabit` (`domain/habits`); `DomainError`; `FileSystem`, `DATA_FILE`, `joinPath`; `loadData`, `LoadError`; `saveData`; `restoreLatestBackup(fs, dir, stamp)`; `createSaveScheduler`, `SaveScheduler`, `SaveStatus`; `MemoryFs` (testes). Consumes (Task 2): funções de `domain/checklist`.
- Produces:
  - `interface Settings { getDataDir(): Promise<string | null>; setDataDir(dir: string): Promise<void> }`
  - `interface Clock { now(): string; today(): string; stamp(): string; newId(): string }` (`now` = ISO 8601; `today` = `YYYY-MM-DD` local; `stamp` = seguro para nome de arquivo)
  - `interface AppDeps { fs: FileSystem; settings: Settings; clock: Clock; debounceMs?: number; retryMs?: number }`
  - `type View = { type: "today" } | { type: "habits" } | { type: "settings" } | { type: "board"; boardId: string }`
  - `type Phase = "booting" | "choose-folder" | "load-error" | "ready"`
  - `interface AppState { phase; dataDir: string | null; data: KambanData; loadError: { error: LoadError; message: string } | null; saveStatus: SaveStatus; lastSaveFailed: boolean; conflict: boolean; notice: string | null; today: string; view: View; selectedCardId: string | null }`
  - `interface AppActions` (lista completa no código abaixo), `type AppStoreState = AppState & AppActions`, `type AppStore = StoreApi<AppStoreState>`
  - `createAppStore(deps: AppDeps): AppStore`
  - Em `testing.ts`: `fakeClock(start?: string): Clock & { setToday(value: string): void }` (ids `id-1`, `id-2`, ...; `now()` = `${today}T12:00:00.000Z`; `stamp()` = `${today}T12-00-00Z`) e `memorySettings(initial?: string | null): Settings & { readonly current: string | null }`
  - Importante para as tarefas de UI: abrir uma pasta vazia com `fakeClock()` novo cria o quadro "To-do" com id `id-1` e colunas `id-2` ("A fazer"), `id-3` ("Fazendo") e `id-4` ("Feito", `isDone`).

- [ ] **Step 1: Instalar o Zustand**

```bash
pnpm add zustand@^5
```

- [ ] **Step 2: Escrever os helpers de teste**

`src/store/testing.ts`:
```ts
import type { Clock, Settings } from "./appStore";

export function fakeClock(start = "2026-09-23"): Clock & { setToday(value: string): void } {
  let today = start;
  let counter = 0;
  return {
    now: () => `${today}T12:00:00.000Z`,
    today: () => today,
    stamp: () => `${today}T12-00-00Z`,
    newId: () => `id-${++counter}`,
    setToday(value: string) {
      today = value;
    },
  };
}

export function memorySettings(initial: string | null = null): Settings & { readonly current: string | null } {
  let dir = initial;
  return {
    getDataDir: async () => dir,
    setDataDir: async (value: string) => {
      dir = value;
    },
    get current() {
      return dir;
    },
  };
}
```

- [ ] **Step 3: Escrever o teste que falha**

`src/store/appStore.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { getBoard } from "../domain/boards";
import { getCard } from "../domain/cards";
import { isHabitDone } from "../domain/habits";
import { MemoryFs } from "../persistence/memoryFs";
import { parseData } from "../persistence/load";
import { saveData, serialize } from "../persistence/save";
import { createAppStore, type AppDeps } from "./appStore";
import { fakeClock, memorySettings } from "./testing";

const DIR = "/data";

async function setup(options: { dir?: string | null; debounceMs?: number } = {}) {
  const fs = new MemoryFs();
  await fs.mkdir(DIR);
  const clock = fakeClock();
  const settings = memorySettings(options.dir === undefined ? null : options.dir);
  const deps: AppDeps = { fs, settings, clock, debounceMs: options.debounceMs ?? 1 };
  const store = createAppStore(deps);
  return { fs, clock, settings, store, state: () => store.getState() };
}

async function readFile(fs: MemoryFs) {
  const result = parseData(await fs.readText("/data/kamban.json"));
  if (!result.ok) throw new Error(result.message);
  return result.data;
}

describe("boot e abertura de pasta", () => {
  it("sem pasta salva vai para a escolha de pasta", async () => {
    const { state } = await setup();
    await state().boot();
    expect(state().phase).toBe("choose-folder");
  });

  it("pasta vazia: cria o arquivo com o quadro To-do, lembra a pasta e fica pronto", async () => {
    const { fs, settings, state } = await setup();
    await state().openFolder(DIR);
    expect(state().phase).toBe("ready");
    expect(state().dataDir).toBe(DIR);
    expect(settings.current).toBe(DIR);
    expect(getBoard(state().data, "id-1").name).toBe("To-do");
    expect((await readFile(fs)).boards).toHaveLength(1);
    expect(state().view).toEqual({ type: "today" });
  });

  it("boot com pasta salva abre essa pasta", async () => {
    const { state } = await setup({ dir: DIR });
    await state().boot();
    expect(state().phase).toBe("ready");
  });

  it("pasta inexistente volta para a escolha com aviso", async () => {
    const { state } = await setup();
    await state().openFolder("/sumiu");
    expect(state().phase).toBe("choose-folder");
    expect(state().notice).toContain("/sumiu");
  });

  it("arquivo corrompido vai para load-error sem sobrescrever o arquivo", async () => {
    const { fs, state } = await setup();
    await fs.writeText("/data/kamban.json", "{ quebrado");
    await state().openFolder(DIR);
    expect(state().phase).toBe("load-error");
    expect(state().loadError?.error).toBe("invalid-json");
    expect(await fs.readText("/data/kamban.json")).toBe("{ quebrado");
  });
});

describe("restoreBackup", () => {
  it("restaura o backup válido e fica pronto", async () => {
    const { fs, state } = await setup();
    const good = await (async () => {
      const temp = await setup();
      await temp.state().openFolder(DIR);
      return temp.state().data;
    })();
    await fs.mkdir("/data/backups");
    await fs.writeText("/data/backups/kamban-2026-09-22.json", serialize(good));
    await fs.writeText("/data/kamban.json", "{ quebrado");
    await state().openFolder(DIR);
    await state().restoreBackup();
    expect(state().phase).toBe("ready");
    expect(state().data).toEqual(good);
    expect(state().notice).toContain("kamban-2026-09-22.json");
  });

  it("sem backup válido mantém o erro e avisa", async () => {
    const { fs, state } = await setup();
    await fs.writeText("/data/kamban.json", "{ quebrado");
    await state().openFolder(DIR);
    await state().restoreBackup();
    expect(state().phase).toBe("load-error");
    expect(state().notice).toBe("Nenhum backup válido encontrado.");
  });
});

describe("alterações e gravação", () => {
  it("altera na memória na hora e grava no flush", async () => {
    const { fs, state } = await setup();
    await state().openFolder(DIR);
    const id = state().addCard("id-1", "id-2", "Comprar pão");
    expect(id).toBe("id-5");
    expect(getCard(state().data, "id-5").title).toBe("Comprar pão");
    await state().flush();
    expect(getCard(await readFile(fs), "id-5").title).toBe("Comprar pão");
    expect(state().saveStatus).toBe("saved");
  });

  it("DomainError vira aviso e não agenda gravação", async () => {
    const { state } = await setup();
    await state().openFolder(DIR);
    expect(state().addCard("id-1", "id-2", "   ")).toBeNull();
    expect(state().notice).toBe("Título não pode ficar vazio.");
    expect(state().hasPendingChanges()).toBe(false);
    state().dismissNotice();
    expect(state().notice).toBeNull();
  });

  it("falha ao gravar marca lastSaveFailed até uma gravação dar certo", async () => {
    const { fs, state } = await setup();
    await state().openFolder(DIR);
    fs.failWrites = true;
    state().addBoard("Casa");
    await state().flush();
    expect(state().saveStatus).toBe("error");
    expect(state().lastSaveFailed).toBe(true);

    state().renameBoard("id-1", "Tarefas");
    expect(state().saveStatus).toBe("pending");
    expect(state().lastSaveFailed).toBe(true);

    fs.failWrites = false;
    await state().onFocus();
    expect(state().lastSaveFailed).toBe(false);
    expect(getBoard(await readFile(fs), "id-1").name).toBe("Tarefas");
  });

  it("checklist, hábitos e navegação", async () => {
    const { clock, state } = await setup();
    await state().openFolder(DIR);
    const cardId = state().addCard("id-1", "id-2", "Mala")!;
    expect(state().addChecklistItem(cardId, "Carregador")).toBe(true);
    const itemId = getCard(state().data, cardId).checklist[0]!.id;
    state().toggleChecklistItem(cardId, itemId);
    expect(getCard(state().data, cardId).checklist[0]!.done).toBe(true);

    state().addHabit("Água", { type: "daily" });
    const habitId = state().data.habits[0]!.id;
    state().toggleHabit(habitId);
    expect(isHabitDone(state().data, habitId, "2026-09-23")).toBe(true);
    clock.setToday("2026-09-24");
    state().refreshToday();
    expect(state().today).toBe("2026-09-24");
    state().toggleHabit(habitId);
    expect(isHabitDone(state().data, habitId, "2026-09-24")).toBe(true);

    state().setView({ type: "board", boardId: "id-1" });
    state().openCard(cardId);
    expect(state().selectedCardId).toBe(cardId);
    state().archiveCard(cardId);
    expect(state().selectedCardId).toBeNull();
    state().archiveBoard("id-1");
    expect(state().view).toEqual({ type: "today" });
  });
});

describe("alteração externa do arquivo", () => {
  async function externalEdit(fs: MemoryFs, name: string) {
    const current = await readFile(fs);
    const edited = { ...current, boards: current.boards.map((b) => ({ ...b, name })) };
    await saveData(fs, DIR, edited, "2026-09-23");
  }

  it("sem edições pendentes recarrega do disco ao ganhar foco", async () => {
    const { fs, state } = await setup();
    await state().openFolder(DIR);
    await externalEdit(fs, "Do outro Mac");
    await state().onFocus();
    expect(getBoard(state().data, "id-1").name).toBe("Do outro Mac");
    expect(state().conflict).toBe(false);
  });

  it("com edições pendentes pergunta; 'disk' descarta as do app", async () => {
    const { fs, state } = await setup({ debounceMs: 60_000 });
    await state().openFolder(DIR);
    state().renameBoard("id-1", "Do app");
    await externalEdit(fs, "Do disco");
    await state().onFocus();
    expect(state().conflict).toBe(true);
    await state().resolveConflict("disk");
    expect(state().conflict).toBe(false);
    expect(getBoard(state().data, "id-1").name).toBe("Do disco");
    expect(state().hasPendingChanges()).toBe(false);
  });

  it("'app' grava a versão do app por cima", async () => {
    const { fs, state } = await setup({ debounceMs: 60_000 });
    await state().openFolder(DIR);
    state().renameBoard("id-1", "Do app");
    await externalEdit(fs, "Do disco");
    await state().onFocus();
    await state().resolveConflict("app");
    expect(state().conflict).toBe(false);
    expect(getBoard(await readFile(fs), "id-1").name).toBe("Do app");
  });

  it("a própria gravação do app não conta como alteração externa", async () => {
    const { state } = await setup();
    await state().openFolder(DIR);
    state().renameBoard("id-1", "Meu");
    await state().flush();
    await state().onFocus();
    expect(state().conflict).toBe(false);
    expect(getBoard(state().data, "id-1").name).toBe("Meu");
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `pnpm test src/store`
Expected: FAIL, `Failed to resolve import "./appStore"`

- [ ] **Step 5: Implementar**

`src/store/appStore.ts`:
```ts
import { createStore, type StoreApi } from "zustand/vanilla";
import { addBoard, archiveBoard, createEmptyData, createInitialData, renameBoard, reorderBoards } from "../domain/boards";
import {
  addCard,
  archiveCard,
  completeCard,
  deleteCard,
  getCard,
  moveCard,
  updateCard,
  type CardPatch,
} from "../domain/cards";
import {
  addChecklistItem,
  moveChecklistItem,
  removeChecklistItem,
  renameChecklistItem,
  toggleChecklistItem,
} from "../domain/checklist";
import { addColumn, removeColumn, renameColumn, reorderColumns, setDoneColumn } from "../domain/columns";
import { DomainError } from "../domain/errors";
import { addHabit, archiveHabit, reorderHabits, toggleHabit, updateHabit } from "../domain/habits";
import type { ChecklistItem, HabitSchedule, KambanData } from "../domain/schema";
import { DATA_FILE, joinPath, type FileSystem } from "../persistence/fs";
import { loadData, type LoadError } from "../persistence/load";
import { restoreLatestBackup } from "../persistence/restore";
import { saveData } from "../persistence/save";
import { createSaveScheduler, type SaveScheduler, type SaveStatus } from "../persistence/saveScheduler";

export interface Settings {
  getDataDir(): Promise<string | null>;
  setDataDir(dir: string): Promise<void>;
}

export interface Clock {
  /** Carimbo ISO 8601 para createdAt/updatedAt. */
  now(): string;
  /** Dia local "YYYY-MM-DD". */
  today(): string;
  /** Carimbo seguro para nome de arquivo. */
  stamp(): string;
  newId(): string;
}

export interface AppDeps {
  fs: FileSystem;
  settings: Settings;
  clock: Clock;
  debounceMs?: number;
  retryMs?: number;
}

export type View = { type: "today" } | { type: "habits" } | { type: "settings" } | { type: "board"; boardId: string };
export type Phase = "booting" | "choose-folder" | "load-error" | "ready";

export interface AppState {
  phase: Phase;
  dataDir: string | null;
  data: KambanData;
  loadError: { error: LoadError; message: string } | null;
  saveStatus: SaveStatus;
  /** Verdadeiro desde a última gravação que falhou até a próxima que der certo. */
  lastSaveFailed: boolean;
  /** O arquivo mudou fora do app enquanto havia edições não gravadas. */
  conflict: boolean;
  notice: string | null;
  today: string;
  view: View;
  selectedCardId: string | null;
}

export interface AppActions {
  boot(): Promise<void>;
  openFolder(dir: string): Promise<void>;
  restoreBackup(): Promise<void>;
  flush(): Promise<void>;
  hasPendingChanges(): boolean;
  onFocus(): Promise<void>;
  refreshToday(): void;
  resolveConflict(keep: "app" | "disk"): Promise<void>;
  showNotice(message: string): void;
  dismissNotice(): void;
  setView(view: View): void;
  openCard(cardId: string | null): void;

  addBoard(name: string): string | null;
  renameBoard(boardId: string, name: string): boolean;
  archiveBoard(boardId: string): boolean;
  reorderBoards(orderedIds: string[]): boolean;

  addColumn(boardId: string, name: string): boolean;
  renameColumn(boardId: string, columnId: string, name: string): boolean;
  setDoneColumn(boardId: string, columnId: string): boolean;
  removeColumn(boardId: string, columnId: string, moveCardsTo?: string): boolean;
  reorderColumns(boardId: string, orderedIds: string[]): boolean;

  addCard(boardId: string, columnId: string, title: string): string | null;
  updateCard(cardId: string, patch: CardPatch): boolean;
  moveCard(cardId: string, toColumnId: string, toIndex: number): boolean;
  completeCard(cardId: string): boolean;
  archiveCard(cardId: string): boolean;
  deleteCard(cardId: string): boolean;

  addChecklistItem(cardId: string, text: string): boolean;
  toggleChecklistItem(cardId: string, itemId: string): boolean;
  renameChecklistItem(cardId: string, itemId: string, text: string): boolean;
  removeChecklistItem(cardId: string, itemId: string): boolean;
  moveChecklistItem(cardId: string, itemId: string, delta: -1 | 1): boolean;

  addHabit(title: string, schedule: HabitSchedule): boolean;
  updateHabit(habitId: string, patch: { title?: string; schedule?: HabitSchedule }): boolean;
  archiveHabit(habitId: string): boolean;
  reorderHabits(orderedIds: string[]): boolean;
  toggleHabit(habitId: string): boolean;
}

export type AppStoreState = AppState & AppActions;
export type AppStore = StoreApi<AppStoreState>;

export function createAppStore(deps: AppDeps): AppStore {
  const { fs, settings, clock } = deps;
  let scheduler: SaveScheduler | null = null;
  /** mtime do kamban.json na última leitura ou gravação feita pelo app. */
  let lastMtime = 0;

  return createStore<AppStoreState>()((set, get) => {
    function stopScheduler() {
      scheduler?.dispose();
      scheduler = null;
    }

    function startScheduler(dir: string) {
      stopScheduler();
      scheduler = createSaveScheduler({
        debounceMs: deps.debounceMs,
        retryMs: deps.retryMs,
        save: async () => {
          lastMtime = await saveData(fs, dir, get().data, clock.today());
        },
        onStatus: (status) =>
          set((s) => ({
            saveStatus: status,
            lastSaveFailed: status === "error" ? true : status === "saved" ? false : s.lastSaveFailed,
          })),
      });
    }

    function becomeReady(dir: string, data: KambanData, mtime: number) {
      lastMtime = mtime;
      startScheduler(dir);
      set({
        phase: "ready",
        dataDir: dir,
        data,
        loadError: null,
        saveStatus: "saved",
        lastSaveFailed: false,
        conflict: false,
        today: clock.today(),
        view: { type: "today" },
        selectedCardId: null,
      });
    }

    function newBoardIds() {
      return { id: clock.newId(), columnIds: [clock.newId(), clock.newId(), clock.newId()] as [string, string, string] };
    }

    /** Aplica uma função do domínio; DomainError vira aviso. */
    function mutate(fn: (data: KambanData) => KambanData): boolean {
      if (get().phase !== "ready") return false;
      let next: KambanData;
      try {
        next = fn(get().data);
      } catch (error) {
        if (error instanceof DomainError) {
          set({ notice: error.message });
          return false;
        }
        throw error;
      }
      set({ data: next });
      scheduler?.schedule();
      return true;
    }

    function mutateChecklist(cardId: string, fn: (items: ChecklistItem[]) => ChecklistItem[]): boolean {
      return mutate((d) => updateCard(d, cardId, { checklist: fn(getCard(d, cardId).checklist) }, clock.now()));
    }

    async function reloadFromDisk(dir: string) {
      const outcome = await loadData(fs, dir);
      if (outcome.status === "ok") {
        lastMtime = outcome.mtime;
        set({ data: outcome.data, conflict: false });
      } else if (outcome.status === "error") {
        stopScheduler();
        set({ phase: "load-error", loadError: { error: outcome.error, message: outcome.message }, conflict: false });
      }
    }

    async function checkExternalChange() {
      const dir = get().dataDir;
      if (!dir || get().phase !== "ready" || get().saveStatus === "saving") return;
      let mtime: number;
      try {
        mtime = await fs.mtime(joinPath(dir, DATA_FILE));
      } catch {
        return;
      }
      if (mtime === lastMtime) return;
      if (scheduler?.hasPendingChanges()) {
        set({ conflict: true });
        return;
      }
      await reloadFromDisk(dir);
    }

    return {
      phase: "booting",
      dataDir: null,
      data: createEmptyData(),
      loadError: null,
      saveStatus: "saved",
      lastSaveFailed: false,
      conflict: false,
      notice: null,
      today: clock.today(),
      view: { type: "today" },
      selectedCardId: null,

      async boot() {
        const dir = await settings.getDataDir();
        if (!dir) {
          set({ phase: "choose-folder" });
          return;
        }
        await get().openFolder(dir);
      },

      async openFolder(dir) {
        await scheduler?.flush();
        stopScheduler();
        set({ phase: "booting" });
        const outcome = await loadData(fs, dir);
        switch (outcome.status) {
          case "no-folder":
            set({ phase: "choose-folder", notice: `Pasta não encontrada: ${dir}` });
            return;
          case "missing": {
            const data = createInitialData(newBoardIds());
            try {
              const mtime = await saveData(fs, dir, data, clock.today());
              await settings.setDataDir(dir);
              becomeReady(dir, data, mtime);
            } catch (error) {
              set({ phase: "choose-folder", notice: `Não foi possível criar o arquivo em ${dir}: ${String(error)}` });
            }
            return;
          }
          case "ok":
            await settings.setDataDir(dir);
            becomeReady(dir, outcome.data, outcome.mtime);
            return;
          case "error":
            await settings.setDataDir(dir);
            set({ phase: "load-error", dataDir: dir, loadError: { error: outcome.error, message: outcome.message } });
            return;
        }
      },

      async restoreBackup() {
        const dir = get().dataDir;
        if (!dir) return;
        try {
          const outcome = await restoreLatestBackup(fs, dir, clock.stamp());
          if (outcome.status === "no-backup") {
            set({ notice: "Nenhum backup válido encontrado." });
            return;
          }
          becomeReady(dir, outcome.data, outcome.mtime);
          set({ notice: `Backup ${outcome.backup} restaurado. O arquivo anterior foi guardado em backups/.` });
        } catch (error) {
          set({ notice: `Não foi possível restaurar o backup: ${String(error)}` });
        }
      },

      async flush() {
        await scheduler?.flush();
      },

      hasPendingChanges: () => scheduler?.hasPendingChanges() ?? false,

      async onFocus() {
        get().refreshToday();
        if (get().phase !== "ready") return;
        if (get().lastSaveFailed) await scheduler?.flush();
        await checkExternalChange();
      },

      refreshToday() {
        const today = clock.today();
        if (today !== get().today) set({ today });
      },

      async resolveConflict(keep) {
        const dir = get().dataDir;
        if (!dir) return;
        set({ conflict: false });
        if (keep === "app") {
          scheduler?.schedule();
          await scheduler?.flush();
          return;
        }
        startScheduler(dir);
        await reloadFromDisk(dir);
      },

      showNotice: (message) => set({ notice: message }),
      dismissNotice: () => set({ notice: null }),
      setView: (view) => set({ view, selectedCardId: null }),
      openCard: (cardId) => set({ selectedCardId: cardId }),

      addBoard(name) {
        const ids = newBoardIds();
        return mutate((d) => addBoard(d, { ...ids, name })) ? ids.id : null;
      },
      renameBoard: (boardId, name) => mutate((d) => renameBoard(d, boardId, name)),
      archiveBoard(boardId) {
        const ok = mutate((d) => archiveBoard(d, boardId));
        const view = get().view;
        if (ok && view.type === "board" && view.boardId === boardId) get().setView({ type: "today" });
        return ok;
      },
      reorderBoards: (orderedIds) => mutate((d) => reorderBoards(d, orderedIds)),

      addColumn: (boardId, name) => mutate((d) => addColumn(d, { boardId, id: clock.newId(), name })),
      renameColumn: (boardId, columnId, name) => mutate((d) => renameColumn(d, boardId, columnId, name)),
      setDoneColumn: (boardId, columnId) => mutate((d) => setDoneColumn(d, boardId, columnId, clock.now())),
      removeColumn: (boardId, columnId, moveCardsTo) =>
        mutate((d) => removeColumn(d, { boardId, columnId, moveCardsTo, now: clock.now() })),
      reorderColumns: (boardId, orderedIds) => mutate((d) => reorderColumns(d, boardId, orderedIds)),

      addCard(boardId, columnId, title) {
        const id = clock.newId();
        return mutate((d) => addCard(d, { id, boardId, columnId, title, now: clock.now() })) ? id : null;
      },
      updateCard: (cardId, patch) => mutate((d) => updateCard(d, cardId, patch, clock.now())),
      moveCard: (cardId, toColumnId, toIndex) =>
        mutate((d) => moveCard(d, { cardId, toColumnId, toIndex, now: clock.now() })),
      completeCard: (cardId) => mutate((d) => completeCard(d, cardId, clock.now())),
      archiveCard(cardId) {
        const ok = mutate((d) => archiveCard(d, cardId, clock.now()));
        if (ok && get().selectedCardId === cardId) set({ selectedCardId: null });
        return ok;
      },
      deleteCard(cardId) {
        const ok = mutate((d) => deleteCard(d, cardId));
        if (ok && get().selectedCardId === cardId) set({ selectedCardId: null });
        return ok;
      },

      addChecklistItem: (cardId, text) => mutateChecklist(cardId, (items) => addChecklistItem(items, clock.newId(), text)),
      toggleChecklistItem: (cardId, itemId) => mutateChecklist(cardId, (items) => toggleChecklistItem(items, itemId)),
      renameChecklistItem: (cardId, itemId, text) =>
        mutateChecklist(cardId, (items) => renameChecklistItem(items, itemId, text)),
      removeChecklistItem: (cardId, itemId) => mutateChecklist(cardId, (items) => removeChecklistItem(items, itemId)),
      moveChecklistItem: (cardId, itemId, delta) =>
        mutateChecklist(cardId, (items) => moveChecklistItem(items, itemId, delta)),

      addHabit: (title, schedule) => mutate((d) => addHabit(d, { id: clock.newId(), title, schedule, now: clock.now() })),
      updateHabit: (habitId, patch) => mutate((d) => updateHabit(d, habitId, patch)),
      archiveHabit: (habitId) => mutate((d) => archiveHabit(d, habitId)),
      reorderHabits: (orderedIds) => mutate((d) => reorderHabits(d, orderedIds)),
      toggleHabit: (habitId) => mutate((d) => toggleHabit(d, habitId, get().today)),
    };
  });
}
```

Notas para quem implementa:
- `addCard` gera o id antes de chamar `mutate`; no teste "altera na memória", os ids `id-1` a `id-4` foram usados pelo quadro inicial, então o cartão recebe `id-5`.
- Em `openFolder`, o caso `error` também grava a pasta nas configurações: ao reabrir o app, o usuário vê o mesmo erro com as opções de restaurar.

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm test src/store && pnpm typecheck && pnpm lint`
Expected: todos os testes de `src/store` passam; sem erros. Se um teste falhar, entenda a causa (ordem das gravações, `mtime` do `MemoryFs`) antes de mexer no código; não mude o teste para passar.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml src/store
git commit -m "feat(store): store do app com abertura de pasta, gravação, backup e conflito"
```

---

### Task 4: Adaptadores de plataforma (Tauri)

**Files:**
- Create: `src/platform/platform.ts`, `src/platform/tauriFs.ts`, `src/platform/settings.ts`, `src/platform/clock.ts`, `src/platform/tauriPlatform.ts`, `src/platform/windowLifecycle.ts`
- Test: `src/platform/tauriFs.test.ts`, `src/platform/clock.test.ts`, `src/platform/windowLifecycle.test.ts`
- Modify: `package.json` (se o `tauri add` da Task 1 não tiver instalado os pacotes npm dos plugins, instale `@tauri-apps/plugin-fs @tauri-apps/plugin-dialog @tauri-apps/plugin-store @tauri-apps/plugin-opener`)

**Interfaces:**
- Consumes: `FileSystem` (`persistence/fs`); `Settings`, `Clock`, `AppStore` (Task 3); `toISODate` (`domain/dates`).
- Produces:
  - `interface Platform { pickFolder(): Promise<string | null>; confirm(message: string): Promise<boolean>; revealFolder(path: string): Promise<void>; openUrl(url: string): Promise<void> }` em `platform.ts`
  - `tauriFs: FileSystem`
  - `createTauriSettings(): Promise<Settings>`
  - `systemClock: Clock`
  - `tauriPlatform: Platform`
  - `interface LifecycleWindow { onCloseRequested(handler: (event: { preventDefault(): void }) => Promise<void>): Promise<unknown>; onFocusChanged(handler: (event: { payload: boolean }) => void): Promise<unknown> }`
  - `attachWindowLifecycle(store: AppStore, win: LifecycleWindow, confirmClose: (message: string) => Promise<boolean>, intervalMs?: number): Promise<() => void>` (devolve função que para o timer do dia)

- [ ] **Step 1: Escrever os testes que falham**

`src/platform/tauriFs.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const fsMock = vi.hoisted(() => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  rename: vi.fn(),
  exists: vi.fn(),
  mkdir: vi.fn(),
  readDir: vi.fn(),
  remove: vi.fn(),
  stat: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-fs", () => fsMock);

import { tauriFs } from "./tauriFs";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("tauriFs", () => {
  it("repassa leitura, escrita, rename e remove", async () => {
    fsMock.readTextFile.mockResolvedValue("conteúdo");
    expect(await tauriFs.readText("/d/a.json")).toBe("conteúdo");
    await tauriFs.writeText("/d/a.json", "x");
    expect(fsMock.writeTextFile).toHaveBeenCalledWith("/d/a.json", "x");
    await tauriFs.rename("/d/a", "/d/b");
    expect(fsMock.rename).toHaveBeenCalledWith("/d/a", "/d/b");
    await tauriFs.remove("/d/b");
    expect(fsMock.remove).toHaveBeenCalledWith("/d/b");
  });

  it("mkdir só cria se não existir, de forma recursiva", async () => {
    fsMock.exists.mockResolvedValueOnce(true);
    await tauriFs.mkdir("/d/backups");
    expect(fsMock.mkdir).not.toHaveBeenCalled();
    fsMock.exists.mockResolvedValueOnce(false);
    await tauriFs.mkdir("/d/backups");
    expect(fsMock.mkdir).toHaveBeenCalledWith("/d/backups", { recursive: true });
  });

  it("list devolve só nomes de arquivos", async () => {
    fsMock.readDir.mockResolvedValue([
      { name: "kamban-2026-09-23.json", isFile: true, isDirectory: false, isSymlink: false },
      { name: "sub", isFile: false, isDirectory: true, isSymlink: false },
    ]);
    expect(await tauriFs.list("/d/backups")).toEqual(["kamban-2026-09-23.json"]);
  });

  it("mtime converte Date para milissegundos e usa 0 quando não há data", async () => {
    fsMock.stat.mockResolvedValueOnce({ mtime: new Date(1_700_000_000_000) });
    expect(await tauriFs.mtime("/d/a")).toBe(1_700_000_000_000);
    fsMock.stat.mockResolvedValueOnce({ mtime: null });
    expect(await tauriFs.mtime("/d/a")).toBe(0);
  });
});
```

`src/platform/clock.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { systemClock } from "./clock";

describe("systemClock", () => {
  it("today no formato YYYY-MM-DD e now em ISO 8601", () => {
    expect(systemClock.today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const now = systemClock.now();
    expect(new Date(now).toISOString()).toBe(now);
  });

  it("stamp não tem ':' nem '.' e ids são únicos", () => {
    expect(systemClock.stamp()).not.toMatch(/[:.]/);
    expect(systemClock.newId()).not.toBe(systemClock.newId());
  });
});
```

`src/platform/windowLifecycle.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryFs } from "../persistence/memoryFs";
import { createAppStore } from "../store/appStore";
import { fakeClock, memorySettings } from "../store/testing";
import { attachWindowLifecycle, type LifecycleWindow } from "./windowLifecycle";

function fakeWindow() {
  let close: ((event: { preventDefault(): void }) => Promise<void>) | undefined;
  let focus: ((event: { payload: boolean }) => void) | undefined;
  const win: LifecycleWindow = {
    onCloseRequested: async (handler) => {
      close = handler;
    },
    onFocusChanged: async (handler) => {
      focus = handler;
    },
  };
  return {
    win,
    async requestClose() {
      const event = { prevented: false, preventDefault() { this.prevented = true; } };
      await close?.(event);
      return event.prevented;
    },
    focus: (payload: boolean) => focus?.({ payload }),
  };
}

async function readyStore(fs: MemoryFs) {
  await fs.mkdir("/data");
  const clock = fakeClock();
  const store = createAppStore({ fs, settings: memorySettings(), clock, debounceMs: 60_000 });
  await store.getState().openFolder("/data");
  return { store, clock };
}

let stop: () => void = () => {};
afterEach(() => stop());

describe("attachWindowLifecycle", () => {
  it("ao fechar grava o que falta e deixa fechar", async () => {
    const fs = new MemoryFs();
    const { store } = await readyStore(fs);
    const w = fakeWindow();
    const confirmClose = vi.fn(async () => true);
    stop = await attachWindowLifecycle(store, w.win, confirmClose);
    store.getState().renameBoard("id-1", "Antes de fechar");
    expect(await w.requestClose()).toBe(false);
    expect(await fs.readText("/data/kamban.json")).toContain("Antes de fechar");
    expect(confirmClose).not.toHaveBeenCalled();
  });

  it("se a gravação falhar pergunta, e cancela o fechamento quando o usuário recusa", async () => {
    const fs = new MemoryFs();
    const { store } = await readyStore(fs);
    const w = fakeWindow();
    const confirmClose = vi.fn(async () => false);
    stop = await attachWindowLifecycle(store, w.win, confirmClose);
    fs.failWrites = true;
    store.getState().renameBoard("id-1", "Não salvo");
    expect(await w.requestClose()).toBe(true);
    expect(confirmClose).toHaveBeenCalledOnce();
  });

  it("ao ganhar foco chama onFocus", async () => {
    const fs = new MemoryFs();
    const { store } = await readyStore(fs);
    const w = fakeWindow();
    const onFocus = vi.spyOn(store.getState(), "onFocus");
    stop = await attachWindowLifecycle(store, w.win, async () => true);
    w.focus(false);
    expect(onFocus).not.toHaveBeenCalled();
    w.focus(true);
    expect(onFocus).toHaveBeenCalledOnce();
  });

  describe("virada do dia", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("atualiza o today periodicamente", async () => {
      const fs = new MemoryFs();
      const { store, clock } = await readyStore(fs);
      stop = await attachWindowLifecycle(store, fakeWindow().win, async () => true, 1000);
      clock.setToday("2026-09-24");
      await vi.advanceTimersByTimeAsync(1000);
      expect(store.getState().today).toBe("2026-09-24");
    });
  });
});
```
Observação: `vi.spyOn(store.getState(), "onFocus")` funciona porque as ações são propriedades do mesmo objeto de estado, e `attachWindowLifecycle` lê `store.getState().onFocus` na hora do evento.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/platform`
Expected: FAIL, imports `./tauriFs`, `./clock`, `./windowLifecycle` não resolvidos.

- [ ] **Step 3: Implementar**

`src/platform/platform.ts`:
```ts
/** Serviços do sistema usados pela interface. A UI nunca importa Tauri diretamente. */
export interface Platform {
  /** Abre o seletor de pasta. Devolve o caminho escolhido ou null se cancelado. */
  pickFolder(): Promise<string | null>;
  confirm(message: string): Promise<boolean>;
  /** Mostra a pasta no Finder. */
  revealFolder(path: string): Promise<void>;
  /** Abre um link no navegador padrão. */
  openUrl(url: string): Promise<void>;
}
```

`src/platform/tauriFs.ts`:
```ts
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
```

`src/platform/settings.ts`:
```ts
import { load } from "@tauri-apps/plugin-store";
import type { Settings } from "../store/appStore";

const DATA_DIR_KEY = "dataDir";

/** Configuração do app (fora da pasta de dados), em settings.json na pasta de dados do app. */
export async function createTauriSettings(): Promise<Settings> {
  const store = await load("settings.json", { autoSave: false });
  return {
    async getDataDir() {
      return (await store.get<string>(DATA_DIR_KEY)) ?? null;
    },
    async setDataDir(dir) {
      await store.set(DATA_DIR_KEY, dir);
      await store.save();
    },
  };
}
```

`src/platform/clock.ts`:
```ts
import { toISODate } from "../domain/dates";
import type { Clock } from "../store/appStore";

export const systemClock: Clock = {
  now: () => new Date().toISOString(),
  today: () => toISODate(new Date()),
  stamp: () => new Date().toISOString().replace(/[:.]/g, "-"),
  newId: () => crypto.randomUUID(),
};
```

`src/platform/tauriPlatform.ts`:
```ts
import { homeDir, join } from "@tauri-apps/api/path";
import { ask, open } from "@tauri-apps/plugin-dialog";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import type { Platform } from "./platform";

const ICLOUD_DRIVE = "Library/Mobile Documents/com~apple~CloudDocs";

export const tauriPlatform: Platform = {
  async pickFolder() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Escolha a pasta de dados do Kamban",
      defaultPath: await join(await homeDir(), ICLOUD_DRIVE),
    });
    return typeof selected === "string" ? selected : null;
  },
  confirm: (message) => ask(message, { title: "Kamban", kind: "warning" }),
  revealFolder: (path) => revealItemInDir(path),
  openUrl: (url) => openUrl(url),
};
```

`src/platform/windowLifecycle.ts`:
```ts
import type { AppStore } from "../store/appStore";

/** Parte da janela do Tauri usada aqui (facilita testar sem Tauri). */
export interface LifecycleWindow {
  onCloseRequested(handler: (event: { preventDefault(): void }) => Promise<void>): Promise<unknown>;
  onFocusChanged(handler: (event: { payload: boolean }) => void): Promise<unknown>;
}

const UNSAVED_MESSAGE = "Algumas alterações não foram salvas. Fechar mesmo assim?";

/**
 * Fechar: grava o que falta; se não der, pergunta antes de fechar.
 * Foco: confere a data do dia, tenta gravar de novo e detecta alteração externa.
 * Timer: atualiza o "hoje" para a virada do dia.
 */
export async function attachWindowLifecycle(
  store: AppStore,
  win: LifecycleWindow,
  confirmClose: (message: string) => Promise<boolean>,
  intervalMs = 60_000,
): Promise<() => void> {
  await win.onCloseRequested(async (event) => {
    await store.getState().flush();
    const state = store.getState();
    if (state.hasPendingChanges() || state.lastSaveFailed) {
      if (!(await confirmClose(UNSAVED_MESSAGE))) event.preventDefault();
    }
  });
  await win.onFocusChanged(({ payload: focused }) => {
    if (focused) void store.getState().onFocus();
  });
  const timer = setInterval(() => store.getState().refreshToday(), intervalMs);
  return () => clearInterval(timer);
}
```
Com o Tauri, a janela real é `getCurrentWindow()` de `@tauri-apps/api/window`: o handler de `onCloseRequested` é aguardado, e se `preventDefault()` não for chamado o próprio Tauri destrói a janela em seguida.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test src/platform && pnpm typecheck && pnpm lint`
Expected: todos passam; sem erros.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml src/platform
git commit -m "feat(platform): adaptadores Tauri para arquivos, configuração, diálogos e janela"
```

---
### Task 5: Base da interface (Tailwind, contexto, telas de abertura)

**Files:**
- Create: `src/index.css`, `src/ui/context.tsx`, `src/ui/styles.ts`, `src/ui/format.ts`, `src/ui/testing.tsx`, `src/ui/Centered.tsx`, `src/ui/Notice.tsx`, `src/ui/InlineEdit.tsx`, `src/ui/PriorityBadge.tsx`, `src/ui/App.tsx`, `src/ui/Shell.tsx` (provisório), `src/ui/screens/ChooseFolder.tsx`, `src/ui/screens/LoadErrorScreen.tsx`
- Modify: `src/main.tsx`, `vite.config.ts` (plugin do Tailwind), `package.json`
- Delete: `src/App.tsx`
- Test: `src/ui/format.test.ts`, `src/ui/App.test.tsx`, `src/ui/InlineEdit.test.tsx`

**Interfaces:**
- Consumes: `createAppStore`, `AppStore`, `AppStoreState` (Task 3); `fakeClock`, `memorySettings` (Task 3); `Platform`, `tauriFs`, `createTauriSettings`, `systemClock`, `tauriPlatform`, `attachWindowLifecycle` (Task 4); `MemoryFs`; `weekdayOf`.
- Produces:
  - `AppProvider({ store, platform, children })`, `useApp<T>(selector: (s: AppStoreState) => T): T`, `usePlatform(): Platform` (`ui/context.tsx`)
  - `styles.ts`: constantes `btn`, `btnPrimary`, `btnDanger`, `input`, `cardBox`, `sectionTitle`, `menuItem`
  - `format.ts`: `formatShortDate(iso): string` ("DD/MM"), `formatDayLabel(iso): string` ("qua, 23/09"), `WEEKDAY_NAMES`, `WEEKDAY_INITIALS`, `PRIORITY_LABEL`, `PRIORITY_CLASS`, `toPriority(value: string): Priority | undefined`
  - `testing.tsx`: `DATA_DIR = "/data"`, `fakePlatform(overrides?: Partial<Platform>): Platform` (todas as funções `vi.fn`; `confirm` devolve `true`), `setupApp(ui, options?: { seed?: (data: KambanData) => KambanData; platform?: Partial<Platform> })` que devolve `{ store, fs, clock, platform, user, ...render }` com o app já pronto (`phase: "ready"`) na pasta `/data`
  - Componentes: `Centered`, `Notice`, `InlineEdit({ value, label, onSave: (v: string) => boolean, className? })`, `PriorityBadge({ priority })`, `App`, `ChooseFolder`, `LoadErrorScreen`
  - `Shell` provisório (substituído na Task 11)

- [ ] **Step 1: Instalar dependências de UI e de teste**

```bash
pnpm add @dnd-kit/core@^6 @dnd-kit/sortable@^10 @dnd-kit/utilities@^3 react-markdown@^10
pnpm add -D tailwindcss@^4 @tailwindcss/vite@^4 jsdom @testing-library/react @testing-library/user-event @testing-library/dom
```

- [ ] **Step 2: Tailwind**

Em `vite.config.ts`, importe `import tailwindcss from "@tailwindcss/vite";` e troque `plugins: [react()]` por `plugins: [react(), tailwindcss()]`. O resto do arquivo fica como na Task 1.

`src/index.css`:
```css
@import "tailwindcss";

html,
body,
#root {
  height: 100%;
}

body {
  margin: 0;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
  @apply bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100;
}
```

- [ ] **Step 3: Escrever os testes que falham**

`src/ui/format.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { formatDayLabel, formatShortDate, toPriority } from "./format";

describe("format", () => {
  it("formata datas", () => {
    expect(formatShortDate("2026-09-03")).toBe("03/09");
    expect(formatDayLabel("2026-09-23")).toBe("qua, 23/09");
    expect(formatDayLabel("2026-09-27")).toBe("dom, 27/09");
  });

  it("converte texto em prioridade", () => {
    expect(toPriority("high")).toBe("high");
    expect(toPriority("")).toBeUndefined();
    expect(toPriority("urgente")).toBeUndefined();
  });
});
```

`src/ui/InlineEdit.test.tsx`:
```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InlineEdit } from "./InlineEdit";

afterEach(cleanup);

describe("InlineEdit", () => {
  it("edita ao clicar, salva com Enter e cancela com Esc", async () => {
    const onSave = vi.fn(() => true);
    const user = userEvent.setup();
    render(<InlineEdit value="To-do" label="Nome do quadro" onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: "To-do" }));
    const field = screen.getByRole("textbox", { name: "Nome do quadro" });
    await user.clear(field);
    await user.type(field, "Tarefas{Enter}");
    expect(onSave).toHaveBeenCalledWith("Tarefas");
    expect(screen.queryByRole("textbox")).toBeNull();

    await user.click(screen.getByRole("button", { name: "To-do" }));
    await user.type(screen.getByRole("textbox"), "xyz{Escape}");
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("continua editando se o salvamento for recusado", async () => {
    const user = userEvent.setup();
    render(<InlineEdit value="A" label="Nome" onSave={() => false} />);
    await user.click(screen.getByRole("button", { name: "A" }));
    await user.clear(screen.getByRole("textbox"));
    await user.keyboard("{Enter}");
    expect(screen.getByRole("textbox")).toBeTruthy();
  });
});
```

`src/ui/App.test.tsx`:
```tsx
// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryFs } from "../persistence/memoryFs";
import { createAppStore } from "../store/appStore";
import { fakeClock, memorySettings } from "../store/testing";
import { App } from "./App";
import { AppProvider } from "./context";
import { fakePlatform } from "./testing";

afterEach(cleanup);

async function renderApp(fs: MemoryFs, options: { dir?: string; pickFolder?: () => Promise<string | null> } = {}) {
  const store = createAppStore({ fs, settings: memorySettings(options.dir ?? null), clock: fakeClock(), debounceMs: 60_000 });
  const platform = fakePlatform(options.pickFolder ? { pickFolder: vi.fn(options.pickFolder) } : {});
  render(
    <AppProvider store={store} platform={platform}>
      <App />
    </AppProvider>,
  );
  await act(() => store.getState().boot());
  return { store, platform, user: userEvent.setup() };
}

describe("App", () => {
  it("primeira abertura: escolhe a pasta e fica pronto", async () => {
    const fs = new MemoryFs();
    await fs.mkdir("/novo");
    const { store, user } = await renderApp(fs, { pickFolder: async () => "/novo" });
    await user.click(screen.getByRole("button", { name: "Escolher pasta" }));
    await waitFor(() => expect(store.getState().phase).toBe("ready"));
    expect(await fs.exists("/novo/kamban.json")).toBe(true);
  });

  it("cancelar a escolha de pasta não muda nada", async () => {
    const fs = new MemoryFs();
    const { store, user } = await renderApp(fs, { pickFolder: async () => null });
    await user.click(screen.getByRole("button", { name: "Escolher pasta" }));
    expect(store.getState().phase).toBe("choose-folder");
  });

  it("arquivo corrompido: mostra o erro e restaura o backup", async () => {
    const fs = new MemoryFs();
    await fs.mkdir("/data");
    const seedFs = new MemoryFs();
    await seedFs.mkdir("/data");
    const seeded = createAppStore({ fs: seedFs, settings: memorySettings(), clock: fakeClock() });
    await seeded.getState().openFolder("/data");
    await fs.mkdir("/data/backups");
    await fs.writeText("/data/backups/kamban-2026-09-22.json", await seedFs.readText("/data/kamban.json"));
    await fs.writeText("/data/kamban.json", "{ quebrado");

    const { store, user } = await renderApp(fs, { dir: "/data" });
    expect(screen.getByText("Não foi possível abrir seus dados")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Restaurar último backup" }));
    await waitFor(() => expect(store.getState().phase).toBe("ready"));
    expect(await screen.findByText(/kamban-2026-09-22.json restaurado/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Fechar aviso" }));
    expect(screen.queryByText(/restaurado/)).toBeNull();
  });

  it("versão futura não oferece restauração", async () => {
    const fs = new MemoryFs();
    await fs.mkdir("/data");
    await fs.writeText("/data/kamban.json", JSON.stringify({ version: 99 }));
    await renderApp(fs, { dir: "/data" });
    expect(screen.getByText("Este arquivo é de uma versão mais nova do Kamban")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Restaurar último backup" })).toBeNull();
  });
});
```
Observação: `seeded` só serve para gerar um kamban.json válido, que vira o backup do teste "arquivo corrompido".

- [ ] **Step 4: Rodar e ver falhar**

Run: `pnpm test src/ui`
Expected: FAIL, imports de `./format`, `./InlineEdit`, `./App`, `./context`, `./testing` não resolvidos.

- [ ] **Step 5: Implementar**

`src/ui/context.tsx`:
```tsx
import { createContext, useContext, type ReactNode } from "react";
import { useStore } from "zustand";
import type { Platform } from "../platform/platform";
import type { AppStore, AppStoreState } from "../store/appStore";

const StoreContext = createContext<AppStore | null>(null);
const PlatformContext = createContext<Platform | null>(null);

export function AppProvider({ store, platform, children }: { store: AppStore; platform: Platform; children: ReactNode }) {
  return (
    <StoreContext.Provider value={store}>
      <PlatformContext.Provider value={platform}>{children}</PlatformContext.Provider>
    </StoreContext.Provider>
  );
}

/** Selecione só valores estáveis (um campo do estado ou uma ação). Derive o resto com useMemo. */
export function useApp<T>(selector: (state: AppStoreState) => T): T {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useApp precisa estar dentro de AppProvider");
  return useStore(store, selector);
}

export function usePlatform(): Platform {
  const platform = useContext(PlatformContext);
  if (!platform) throw new Error("usePlatform precisa estar dentro de AppProvider");
  return platform;
}
```

`src/ui/styles.ts`:
```ts
export const btn =
  "inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800";
export const btnPrimary =
  "inline-flex items-center rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300";
export const btnDanger =
  "inline-flex items-center rounded-md px-2.5 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950";
export const input =
  "w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900";
export const cardBox =
  "rounded-lg border border-zinc-200 bg-white p-2.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900";
export const sectionTitle = "text-xs font-semibold uppercase tracking-wide text-zinc-500";
export const menuItem =
  "block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-zinc-100 disabled:opacity-40 dark:hover:bg-zinc-800";
```

`src/ui/format.ts`:
```ts
import { weekdayOf } from "../domain/dates";
import { prioritySchema, type Priority } from "../domain/schema";

const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export const WEEKDAY_NAMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
export const WEEKDAY_INITIALS = ["D", "S", "T", "Q", "Q", "S", "S"];

export function formatShortDate(iso: string): string {
  const [, month = "", day = ""] = iso.split("-");
  return `${day}/${month}`;
}

export function formatDayLabel(iso: string): string {
  return `${WEEKDAY_SHORT[weekdayOf(iso)]}, ${formatShortDate(iso)}`;
}

export const PRIORITY_LABEL: Record<Priority, string> = { high: "Alta", medium: "Média", low: "Baixa" };

export const PRIORITY_CLASS: Record<Priority, string> = {
  high: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  low: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
};

export function toPriority(value: string): Priority | undefined {
  const result = prioritySchema.safeParse(value);
  return result.success ? result.data : undefined;
}
```

`src/ui/testing.tsx`:
```tsx
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { vi } from "vitest";
import type { KambanData } from "../domain/schema";
import { MemoryFs } from "../persistence/memoryFs";
import type { Platform } from "../platform/platform";
import { createAppStore } from "../store/appStore";
import { fakeClock, memorySettings } from "../store/testing";
import { AppProvider } from "./context";

export const DATA_DIR = "/data";

export function fakePlatform(overrides: Partial<Platform> = {}): Platform {
  return {
    pickFolder: vi.fn(async () => null),
    confirm: vi.fn(async () => true),
    revealFolder: vi.fn(async () => {}),
    openUrl: vi.fn(async () => {}),
    ...overrides,
  };
}

/** Renderiza `ui` com um store já pronto na pasta /data (quadro To-do: id-1; colunas id-2, id-3, id-4). */
export async function setupApp(
  ui: ReactElement,
  options: { seed?: (data: KambanData) => KambanData; platform?: Partial<Platform> } = {},
) {
  const fs = new MemoryFs();
  await fs.mkdir(DATA_DIR);
  const clock = fakeClock();
  // Debounce longo: nos testes de UI nada é gravado sozinho (evita atualizações fora do act). Use flush() quando precisar.
  const store = createAppStore({ fs, settings: memorySettings(), clock, debounceMs: 60_000 });
  await store.getState().openFolder(DATA_DIR);
  if (options.seed) store.setState({ data: options.seed(store.getState().data) });
  const platform = fakePlatform(options.platform);
  const user = userEvent.setup();
  const view = render(
    <AppProvider store={store} platform={platform}>
      {ui}
    </AppProvider>,
  );
  return { store, fs, clock, platform, user, ...view };
}
```

`src/ui/Centered.tsx`:
```tsx
import type { ReactNode } from "react";

export function Centered({ children }: { children: ReactNode }) {
  return <div className="flex h-screen flex-col items-center justify-center gap-4 p-8 text-center">{children}</div>;
}
```

`src/ui/Notice.tsx`:
```tsx
import { useApp } from "./context";

export function Notice() {
  const notice = useApp((s) => s.notice);
  const dismiss = useApp((s) => s.dismissNotice);
  if (!notice) return null;
  return (
    <div
      role="status"
      className="fixed right-4 bottom-4 z-50 flex max-w-sm items-start gap-3 rounded-lg bg-zinc-900 px-4 py-3 text-sm text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900"
    >
      <p className="flex-1">{notice}</p>
      <button type="button" onClick={dismiss} aria-label="Fechar aviso" className="opacity-70 hover:opacity-100">
        ✕
      </button>
    </div>
  );
}
```

`src/ui/InlineEdit.tsx`:
```tsx
import { useState } from "react";
import { input } from "./styles";

/** Texto que vira campo ao clicar. Enter ou sair do campo salva; Esc cancela. */
export function InlineEdit({
  value,
  label,
  onSave,
  className = "",
}: {
  value: string;
  label: string;
  onSave: (value: string) => boolean;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <button
        type="button"
        title="Clique para editar"
        className={`rounded px-1 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 ${className}`}
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
      >
        {value}
      </button>
    );
  }

  function commit() {
    if (draft.trim() === value) {
      setEditing(false);
      return;
    }
    if (onSave(draft)) setEditing(false);
  }

  return (
    <input
      autoFocus
      aria-label={label}
      className={`${input} ${className}`}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}
```

`src/ui/PriorityBadge.tsx`:
```tsx
import type { Priority } from "../domain/schema";
import { PRIORITY_CLASS, PRIORITY_LABEL } from "./format";

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${PRIORITY_CLASS[priority]}`}>
      {PRIORITY_LABEL[priority]}
    </span>
  );
}
```

`src/ui/screens/ChooseFolder.tsx`:
```tsx
import { Centered } from "../Centered";
import { useApp, usePlatform } from "../context";
import { btnPrimary } from "../styles";

export function ChooseFolder() {
  const openFolder = useApp((s) => s.openFolder);
  const { pickFolder } = usePlatform();

  async function choose() {
    const dir = await pickFolder();
    if (dir) await openFolder(dir);
  }

  return (
    <Centered>
      <h1 className="text-xl font-semibold">Onde guardar seus dados?</h1>
      <p className="max-w-md text-sm text-zinc-500">
        Escolha uma pasta para o arquivo kamban.json. Uma pasta no iCloud Drive mantém uma cópia sincronizada e com versões
        anteriores. Se a pasta já tiver um kamban.json, ele será aberto.
      </p>
      <button type="button" className={btnPrimary} onClick={() => void choose()}>
        Escolher pasta
      </button>
    </Centered>
  );
}
```

`src/ui/screens/LoadErrorScreen.tsx`:
```tsx
import { Centered } from "../Centered";
import { useApp, usePlatform } from "../context";
import { btn, btnPrimary } from "../styles";

export function LoadErrorScreen() {
  const loadError = useApp((s) => s.loadError);
  const dataDir = useApp((s) => s.dataDir);
  const restoreBackup = useApp((s) => s.restoreBackup);
  const openFolder = useApp((s) => s.openFolder);
  const { pickFolder } = usePlatform();
  const future = loadError?.error === "future-version";

  async function chooseOther() {
    const dir = await pickFolder();
    if (dir) await openFolder(dir);
  }

  return (
    <Centered>
      <h1 className="text-xl font-semibold">
        {future ? "Este arquivo é de uma versão mais nova do Kamban" : "Não foi possível abrir seus dados"}
      </h1>
      <p className="max-w-lg text-sm text-zinc-500">
        Pasta: <code>{dataDir}</code>. O arquivo não foi alterado.
        {future && " Atualize o app para abri-lo."}
      </p>
      {loadError && (
        <pre className="max-h-48 max-w-lg overflow-auto rounded-md bg-zinc-100 p-3 text-left text-xs whitespace-pre-wrap dark:bg-zinc-900">
          {loadError.message}
        </pre>
      )}
      <div className="flex gap-2">
        {!future && (
          <button type="button" className={btnPrimary} onClick={() => void restoreBackup()}>
            Restaurar último backup
          </button>
        )}
        {dataDir && (
          <button type="button" className={btn} onClick={() => void openFolder(dataDir)}>
            Tentar de novo
          </button>
        )}
        <button type="button" className={btn} onClick={() => void chooseOther()}>
          Escolher outra pasta
        </button>
      </div>
    </Centered>
  );
}
```

`src/ui/Shell.tsx` (provisório, a Task 11 substitui):
```tsx
export function Shell() {
  return <main className="p-8">Kamban</main>;
}
```

`src/ui/App.tsx`:
```tsx
import { Centered } from "./Centered";
import { useApp } from "./context";
import { Notice } from "./Notice";
import { ChooseFolder } from "./screens/ChooseFolder";
import { LoadErrorScreen } from "./screens/LoadErrorScreen";
import { Shell } from "./Shell";

export function App() {
  const phase = useApp((s) => s.phase);
  return (
    <>
      {phase === "booting" && (
        <Centered>
          <p className="text-sm text-zinc-500">Carregando…</p>
        </Centered>
      )}
      {phase === "choose-folder" && <ChooseFolder />}
      {phase === "load-error" && <LoadErrorScreen />}
      {phase === "ready" && <Shell />}
      <Notice />
    </>
  );
}
```

`src/main.tsx` (substitui o da Fase 1; apague `src/App.tsx`):
```tsx
import { getCurrentWindow } from "@tauri-apps/api/window";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { systemClock } from "./platform/clock";
import { createTauriSettings } from "./platform/settings";
import { tauriFs } from "./platform/tauriFs";
import { tauriPlatform } from "./platform/tauriPlatform";
import { attachWindowLifecycle } from "./platform/windowLifecycle";
import { createAppStore } from "./store/appStore";
import { App } from "./ui/App";
import { AppProvider } from "./ui/context";

async function start() {
  const root = document.getElementById("root");
  if (!root) throw new Error("Elemento #root não encontrado");

  const store = createAppStore({ fs: tauriFs, settings: await createTauriSettings(), clock: systemClock });
  createRoot(root).render(
    <StrictMode>
      <AppProvider store={store} platform={tauriPlatform}>
        <App />
      </AppProvider>
    </StrictMode>,
  );
  await attachWindowLifecycle(store, getCurrentWindow(), tauriPlatform.confirm);
  await store.getState().boot();
}

void start();
```

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`
Expected: tudo verde, saída dos testes sem avisos de `act(...)`. Se aparecer aviso de `act`, a verificação logo depois da ação precisa usar `findBy*`/`waitFor`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(ui): base da interface com Tailwind, contexto do store e telas de abertura"
```

---

### Task 6: Tela Hoje

**Files:**
- Create: `src/ui/today/TodayView.tsx`
- Test: `src/ui/today/TodayView.test.tsx`

**Interfaces:**
- Consumes: `buildToday`, `TodayCard` (`domain/today`); `useApp`; `formatDayLabel`, `formatShortDate`; `PriorityBadge`; `styles`; `setupApp` (testes). Ações: `toggleHabit`, `completeCard`, `openCard`.
- Produces: `TodayView()` (sem props).

- [ ] **Step 1: Escrever o teste que falha**

`src/ui/today/TodayView.test.tsx`:
```tsx
// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { addCard, getCard, updateCard } from "../../domain/cards";
import { addHabit, isHabitDone } from "../../domain/habits";
import type { KambanData } from "../../domain/schema";
import { NOW } from "../../domain/testing";
import { setupApp } from "../testing";
import { TodayView } from "./TodayView";

afterEach(cleanup);

const TODAY = "2026-09-23"; // quarta

function seed(data: KambanData): KambanData {
  let d = addHabit(data, { id: "h1", title: "Água", schedule: { type: "daily" }, now: NOW });
  d = addHabit(d, { id: "h2", title: "Faxina", schedule: { type: "custom", days: [6] }, now: NOW });
  d = addCard(d, { id: "k1", boardId: "id-1", columnId: "id-2", title: "Pagar IPVA", now: NOW });
  d = updateCard(d, "k1", { dueDate: "2026-09-20" }, NOW);
  d = addCard(d, { id: "k2", boardId: "id-1", columnId: "id-3", title: "Revisar proposta", now: NOW });
  d = updateCard(d, "k2", { dueDate: TODAY, priority: "high" }, NOW);
  return d;
}

describe("TodayView", () => {
  it("mostra a data, a rotina do dia, os atrasados e os de hoje", async () => {
    await setupApp(<TodayView />, { seed });
    expect(screen.getByText("qua, 23/09")).toBeTruthy();
    expect(screen.getByLabelText("Água")).toBeTruthy();
    expect(screen.queryByText("Faxina")).toBeNull();
    expect(screen.getByText("0/1 feitos")).toBeTruthy();
    within(screen.getByRole("region", { name: "Atrasados" })).getByText("Pagar IPVA");
    const dueToday = within(screen.getByRole("region", { name: "Para hoje" }));
    dueToday.getByText("Revisar proposta");
    dueToday.getByText("Alta");
    dueToday.getByText("To-do");
  });

  it("marca o hábito do dia", async () => {
    const { store, user } = await setupApp(<TodayView />, { seed });
    await user.click(screen.getByLabelText("Água"));
    expect(isHabitDone(store.getState().data, "h1", TODAY)).toBe(true);
    expect(screen.getByText("1/1 feitos")).toBeTruthy();
  });

  it("concluir move o cartão para a coluna Feito e tira da lista", async () => {
    const { store, user } = await setupApp(<TodayView />, { seed });
    await user.click(screen.getByLabelText("Concluir Pagar IPVA"));
    expect(getCard(store.getState().data, "k1").columnId).toBe("id-4");
    expect(screen.queryByText("Pagar IPVA")).toBeNull();
  });

  it("clicar no título abre o detalhe do cartão", async () => {
    const { store, user } = await setupApp(<TodayView />, { seed });
    await user.click(screen.getByRole("button", { name: "Revisar proposta" }));
    expect(store.getState().selectedCardId).toBe("k2");
  });

  it("sem hábitos nem prazos mostra mensagens vazias", async () => {
    await setupApp(<TodayView />);
    expect(screen.getByText("Nenhum hábito para hoje.")).toBeTruthy();
    expect(screen.getByText("Nada com prazo para hoje.")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/ui/today`
Expected: FAIL, `Failed to resolve import "./TodayView"`

- [ ] **Step 3: Implementar**

`src/ui/today/TodayView.tsx`:
```tsx
import { useMemo } from "react";
import { buildToday, type TodayCard } from "../../domain/today";
import { useApp } from "../context";
import { formatDayLabel, formatShortDate } from "../format";
import { PriorityBadge } from "../PriorityBadge";
import { cardBox, sectionTitle } from "../styles";

export function TodayView() {
  const data = useApp((s) => s.data);
  const today = useApp((s) => s.today);
  const toggleHabit = useApp((s) => s.toggleHabit);
  const completeCard = useApp((s) => s.completeCard);
  const openCard = useApp((s) => s.openCard);
  const view = useMemo(() => buildToday(data, today), [data, today]);
  const nothingDue = view.overdue.length === 0 && view.dueToday.length === 0;

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-8">
      <header>
        <h1 className="text-2xl font-semibold">Hoje</h1>
        <p className="text-sm text-zinc-500">{formatDayLabel(today)}</p>
      </header>

      <section aria-label="Rotina">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className={sectionTitle}>Rotina</h2>
          {view.habits.length > 0 && (
            <span className="text-xs text-zinc-500">
              {view.habitsDone}/{view.habits.length} feitos
            </span>
          )}
        </div>
        {view.habits.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum hábito para hoje.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {view.habits.map(({ habit, done }) => (
              <li key={habit.id}>
                <label
                  className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${
                    done
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                      : "border-zinc-200 dark:border-zinc-800"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={done}
                    onChange={() => toggleHabit(habit.id)}
                    className="accent-emerald-600"
                  />
                  {habit.title}
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <CardSection title="Atrasados" items={view.overdue} onComplete={completeCard} onOpen={openCard} overdue />
      <CardSection title="Para hoje" items={view.dueToday} onComplete={completeCard} onOpen={openCard} />
      {nothingDue && <p className="text-sm text-zinc-500">Nada com prazo para hoje.</p>}
    </div>
  );
}

function CardSection({
  title,
  items,
  onComplete,
  onOpen,
  overdue = false,
}: {
  title: string;
  items: TodayCard[];
  onComplete: (cardId: string) => boolean;
  onOpen: (cardId: string) => void;
  overdue?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <section aria-label={title}>
      <h2 className={`${sectionTitle} mb-2`}>
        {title} ({items.length})
      </h2>
      <ul className="space-y-1.5">
        {items.map(({ card, boardName }) => (
          <li key={card.id} className={`${cardBox} flex items-center gap-3`}>
            <input
              type="checkbox"
              checked={false}
              aria-label={`Concluir ${card.title}`}
              onChange={() => onComplete(card.id)}
              className="accent-emerald-600"
            />
            <button type="button" className="flex-1 text-left text-sm" onClick={() => onOpen(card.id)}>
              {card.title}
            </button>
            <span className="text-xs text-zinc-500">{boardName}</span>
            {card.dueDate && (
              <span className={`text-xs ${overdue ? "text-red-600 dark:text-red-400" : "text-zinc-500"}`}>
                {formatShortDate(card.dueDate)}
              </span>
            )}
            {card.priority && <PriorityBadge priority={card.priority} />}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test src/ui && pnpm typecheck && pnpm lint`
Expected: todos passam; sem erros nem avisos de `act`.

- [ ] **Step 5: Commit**

```bash
git add src/ui/today
git commit -m "feat(ui): tela Hoje com rotina, atrasados e prazos do dia"
```

---
### Task 7: Tela do Quadro com arrastar e soltar

**Files:**
- Create: `src/ui/board/dnd.ts`, `src/ui/board/BoardView.tsx`, `src/ui/board/ColumnView.tsx`, `src/ui/board/ColumnMenu.tsx`, `src/ui/board/CardTile.tsx`, `src/ui/board/AddCardForm.tsx`, `src/ui/board/NewColumnForm.tsx`
- Test: `src/ui/board/dnd.test.ts`, `src/ui/board/BoardView.test.tsx`

**Interfaces:**
- Consumes: `cardsInColumn`, `checklistProgress` (`domain/cards`); `boardColumns` (`domain/columns`); `byOrder`; `Board`, `Column`, `Card`, `KambanData`; `useApp`, `usePlatform`; `InlineEdit`, `PriorityBadge`, `formatShortDate`, `styles`. Ações: `moveCard`, `reorderColumns`, `renameBoard`, `archiveBoard`, `renameColumn`, `setDoneColumn`, `removeColumn`, `addColumn`, `addCard`, `openCard`.
- Produces:
  - `dnd.ts`: `cardDndId(id): string` (`card:<id>`), `columnDndId(id): string` (`col:<id>`), `parseDndId(value: string | number): { type: "card" | "column"; id: string } | null`, `resolveCardDrop(data, activeCardId, overId: string | number | null): { toColumnId: string; toIndex: number } | null`, `resolveColumnDrop(data, orderedColumnIds: readonly string[], activeColumnId: string, overId: string | number | null): string[] | null`
  - `BoardView({ boardId })`

- [ ] **Step 1: Escrever os testes que falham**

`src/ui/board/dnd.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { createInitialData } from "../../domain/boards";
import { addCard, cardsInColumn, moveCard } from "../../domain/cards";
import type { KambanData } from "../../domain/schema";
import { NOW } from "../../domain/testing";
import { cardDndId, columnDndId, parseDndId, resolveCardDrop, resolveColumnDrop } from "./dnd";

// Colunas: c1 (A fazer: A, B, C), c2 (Fazendo: X), c3 (Feito)
function data(): KambanData {
  let d = createInitialData({ id: "b1", columnIds: ["c1", "c2", "c3"] });
  for (const [id, columnId] of [["A", "c1"], ["B", "c1"], ["C", "c1"], ["X", "c2"]] as const) {
    d = addCard(d, { id, boardId: "b1", columnId, title: id, now: NOW });
  }
  return d;
}

function applyDrop(d: KambanData, cardId: string, overId: string) {
  const drop = resolveCardDrop(d, cardId, overId);
  if (!drop) return d;
  return moveCard(d, { cardId, toColumnId: drop.toColumnId, toIndex: drop.toIndex, now: NOW });
}
const titles = (d: KambanData, columnId: string) => cardsInColumn(d, columnId).map((c) => c.id);

describe("ids do arrastar e soltar", () => {
  it("codifica e decodifica", () => {
    expect(parseDndId(cardDndId("A"))).toEqual({ type: "card", id: "A" });
    expect(parseDndId(columnDndId("c1"))).toEqual({ type: "column", id: "c1" });
    expect(parseDndId("outro")).toBeNull();
  });
});

describe("resolveCardDrop", () => {
  it("dentro da mesma coluna, para baixo e para cima", () => {
    expect(titles(applyDrop(data(), "A", cardDndId("C")), "c1")).toEqual(["B", "C", "A"]);
    expect(titles(applyDrop(data(), "C", cardDndId("A")), "c1")).toEqual(["C", "A", "B"]);
  });

  it("sobre um cartão de outra coluna entra antes dele", () => {
    const d = applyDrop(data(), "A", cardDndId("X"));
    expect(titles(d, "c2")).toEqual(["A", "X"]);
    expect(titles(d, "c1")).toEqual(["B", "C"]);
  });

  it("sobre a área da coluna vai para o fim", () => {
    expect(titles(applyDrop(data(), "A", columnDndId("c2")), "c2")).toEqual(["X", "A"]);
    expect(titles(applyDrop(data(), "A", columnDndId("c3")), "c3")).toEqual(["A"]);
  });

  it("sem alvo ou sobre si mesmo não faz nada", () => {
    expect(resolveCardDrop(data(), "A", null)).toBeNull();
    expect(resolveCardDrop(data(), "A", cardDndId("A"))).toBeNull();
    expect(resolveCardDrop(data(), "A", "outro")).toBeNull();
  });
});

describe("resolveColumnDrop", () => {
  it("move a coluna para a posição do alvo (coluna ou cartão dela)", () => {
    expect(resolveColumnDrop(data(), ["c1", "c2", "c3"], "c1", columnDndId("c3"))).toEqual(["c2", "c3", "c1"]);
    expect(resolveColumnDrop(data(), ["c1", "c2", "c3"], "c3", cardDndId("A"))).toEqual(["c3", "c1", "c2"]);
  });

  it("sem alvo ou sobre si mesma não faz nada", () => {
    expect(resolveColumnDrop(data(), ["c1", "c2", "c3"], "c1", null)).toBeNull();
    expect(resolveColumnDrop(data(), ["c1", "c2", "c3"], "c1", columnDndId("c1"))).toBeNull();
    expect(resolveColumnDrop(data(), ["c1", "c2", "c3"], "c1", cardDndId("B"))).toBeNull();
  });
});
```

`src/ui/board/BoardView.test.tsx`:
```tsx
// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { getBoard, getColumn } from "../../domain/boards";
import { addCard, cardsInColumn, getCard } from "../../domain/cards";
import { boardColumns } from "../../domain/columns";
import type { KambanData } from "../../domain/schema";
import { NOW } from "../../domain/testing";
import { setupApp } from "../testing";
import { BoardView } from "./BoardView";

afterEach(cleanup);

function seed(data: KambanData): KambanData {
  return addCard(data, { id: "k1", boardId: "id-1", columnId: "id-3", title: "Escrever relatório", now: NOW });
}
const column = (name: string) => within(screen.getByRole("region", { name: `Coluna ${name}` }));
const columnNames = (data: KambanData) => boardColumns(getBoard(data, "id-1")).map((c) => c.name);

describe("BoardView", () => {
  it("mostra as colunas e marca a de concluídos", async () => {
    await setupApp(<BoardView boardId="id-1" />, { seed });
    column("A fazer");
    column("Fazendo").getByText("Escrever relatório");
    column("Feito").getByText("Concluídos");
  });

  it("adiciona cartões pelo formulário da coluna e mantém o campo aberto", async () => {
    const { store, user } = await setupApp(<BoardView boardId="id-1" />);
    await user.click(column("A fazer").getByRole("button", { name: "+ Adicionar cartão" }));
    const field = column("A fazer").getByRole("textbox", { name: "Título do novo cartão" });
    await user.type(field, "Comprar pão{Enter}");
    await user.type(field, "Ligar para o banco{Enter}");
    expect(cardsInColumn(store.getState().data, "id-2").map((c) => c.title)).toEqual(["Comprar pão", "Ligar para o banco"]);
    expect((field as HTMLInputElement).value).toBe("");
    column("A fazer").getByText("Comprar pão");
  });

  it("renomeia o quadro", async () => {
    const { store, user } = await setupApp(<BoardView boardId="id-1" />);
    await user.click(screen.getByRole("button", { name: "To-do" }));
    const field = screen.getByRole("textbox", { name: "Nome do quadro" });
    await user.clear(field);
    await user.type(field, "Tarefas{Enter}");
    expect(getBoard(store.getState().data, "id-1").name).toBe("Tarefas");
  });

  it("remove coluna com cartões escolhendo o destino", async () => {
    const { store, user } = await setupApp(<BoardView boardId="id-1" />, { seed });
    await user.click(screen.getByLabelText("Opções da coluna Fazendo"));
    await user.click(column("Fazendo").getByRole("button", { name: "Remover coluna" }));
    await user.selectOptions(column("Fazendo").getByRole("combobox", { name: "Coluna de destino" }), "id-4");
    await user.click(column("Fazendo").getByRole("button", { name: "Remover e mover" }));
    expect(columnNames(store.getState().data)).toEqual(["A fazer", "Feito"]);
    expect(getCard(store.getState().data, "k1").columnId).toBe("id-4");
  });

  it("remove coluna vazia depois de confirmar", async () => {
    const { store, user, platform } = await setupApp(<BoardView boardId="id-1" />);
    await user.click(screen.getByLabelText("Opções da coluna A fazer"));
    await user.click(column("A fazer").getByRole("button", { name: "Remover coluna" }));
    await waitFor(() => expect(columnNames(store.getState().data)).toEqual(["Fazendo", "Feito"]));
    expect(platform.confirm).toHaveBeenCalledOnce();
  });

  it("usa outra coluna como concluídos", async () => {
    const { store, user } = await setupApp(<BoardView boardId="id-1" />);
    await user.click(screen.getByLabelText("Opções da coluna Fazendo"));
    await user.click(column("Fazendo").getByRole("button", { name: "Usar como coluna de concluídos" }));
    expect(getColumn(getBoard(store.getState().data, "id-1"), "id-3").isDone).toBe(true);
    column("Fazendo").getByText("Concluídos");
  });

  it("adiciona coluna", async () => {
    const { user } = await setupApp(<BoardView boardId="id-1" />);
    await user.click(screen.getByRole("button", { name: "+ Nova coluna" }));
    await user.type(screen.getByRole("textbox", { name: "Nome da nova coluna" }), "Aguardando{Enter}");
    column("Aguardando");
  });

  it("arquiva o quadro depois de confirmar", async () => {
    const { store, user } = await setupApp(<BoardView boardId="id-1" />);
    await user.click(screen.getByRole("button", { name: "Arquivar quadro" }));
    await waitFor(() => expect(getBoard(store.getState().data, "id-1").archived).toBe(true));
  });

  it("clicar no cartão abre o detalhe", async () => {
    const { store, user } = await setupApp(<BoardView boardId="id-1" />, { seed });
    await user.click(screen.getByRole("button", { name: "Escrever relatório" }));
    expect(store.getState().selectedCardId).toBe("k1");
  });

  it("quadro inexistente mostra aviso", async () => {
    await setupApp(<BoardView boardId="nope" />);
    expect(screen.getByText("Quadro não encontrado.")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/ui/board`
Expected: FAIL, imports `./dnd` e `./BoardView` não resolvidos.

- [ ] **Step 3: Implementar**

`src/ui/board/dnd.ts`:
```ts
import { cardsInColumn } from "../../domain/cards";
import type { KambanData } from "../../domain/schema";

export const cardDndId = (id: string) => `card:${id}`;
export const columnDndId = (id: string) => `col:${id}`;

export function parseDndId(value: string | number): { type: "card" | "column"; id: string } | null {
  const text = String(value);
  if (text.startsWith("card:")) return { type: "card", id: text.slice("card:".length) };
  if (text.startsWith("col:")) return { type: "column", id: text.slice("col:".length) };
  return null;
}

/** Para onde vai um cartão solto sobre `overId`: antes do cartão alvo, ou no fim da coluna alvo. */
export function resolveCardDrop(
  data: KambanData,
  activeCardId: string,
  overId: string | number | null,
): { toColumnId: string; toIndex: number } | null {
  if (overId === null) return null;
  const over = parseDndId(overId);
  if (!over) return null;
  if (over.type === "column") return { toColumnId: over.id, toIndex: Number.MAX_SAFE_INTEGER };
  if (over.id === activeCardId) return null;
  const target = data.cards.find((c) => c.id === over.id);
  if (!target) return null;
  const index = cardsInColumn(data, target.columnId).findIndex((c) => c.id === target.id);
  return { toColumnId: target.columnId, toIndex: index };
}

/** Nova ordem das colunas quando a coluna ativa é solta sobre uma coluna ou um cartão dela. */
export function resolveColumnDrop(
  data: KambanData,
  orderedColumnIds: readonly string[],
  activeColumnId: string,
  overId: string | number | null,
): string[] | null {
  if (overId === null) return null;
  const over = parseDndId(overId);
  if (!over) return null;
  const targetId = over.type === "column" ? over.id : data.cards.find((c) => c.id === over.id)?.columnId;
  if (!targetId || targetId === activeColumnId) return null;
  const from = orderedColumnIds.indexOf(activeColumnId);
  const to = orderedColumnIds.indexOf(targetId);
  if (from === -1 || to === -1) return null;
  const next = [...orderedColumnIds];
  const [moved] = next.splice(from, 1);
  if (moved) next.splice(to, 0, moved);
  return next;
}
```

`src/ui/board/BoardView.tsx`:
```tsx
import {
  closestCorners,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { horizontalListSortingStrategy, SortableContext, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useMemo } from "react";
import { boardColumns } from "../../domain/columns";
import type { Board } from "../../domain/schema";
import { useApp, usePlatform } from "../context";
import { InlineEdit } from "../InlineEdit";
import { btn } from "../styles";
import { ColumnView } from "./ColumnView";
import { columnDndId, parseDndId, resolveCardDrop, resolveColumnDrop } from "./dnd";
import { NewColumnForm } from "./NewColumnForm";

export function BoardView({ boardId }: { boardId: string }) {
  const data = useApp((s) => s.data);
  const moveCard = useApp((s) => s.moveCard);
  const reorderColumns = useApp((s) => s.reorderColumns);
  const board = data.boards.find((b) => b.id === boardId);
  const columns = useMemo(() => (board ? boardColumns(board) : []), [board]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!board) return <p className="p-8 text-sm text-zinc-500">Quadro não encontrado.</p>;

  function handleDragEnd({ active, over }: DragEndEvent) {
    const source = parseDndId(active.id);
    if (!source || !board) return;
    const overId = over?.id ?? null;
    if (source.type === "card") {
      const drop = resolveCardDrop(data, source.id, overId);
      if (drop) moveCard(source.id, drop.toColumnId, drop.toIndex);
      return;
    }
    const ids = resolveColumnDrop(
      data,
      columns.map((c) => c.id),
      source.id,
      overId,
    );
    if (ids) reorderColumns(board.id, ids);
  }

  return (
    <div className="flex h-full flex-col">
      <BoardHeader board={board} />
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
        <SortableContext items={columns.map((c) => columnDndId(c.id))} strategy={horizontalListSortingStrategy}>
          <div className="flex flex-1 items-start gap-4 overflow-x-auto p-6">
            {columns.map((column) => (
              <ColumnView key={column.id} board={board} column={column} />
            ))}
            <NewColumnForm boardId={board.id} />
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function BoardHeader({ board }: { board: Board }) {
  const renameBoard = useApp((s) => s.renameBoard);
  const archiveBoard = useApp((s) => s.archiveBoard);
  const { confirm } = usePlatform();

  async function archive() {
    if (await confirm(`Arquivar o quadro "${board.name}"? Os cartões continuam guardados no arquivo de dados.`)) {
      archiveBoard(board.id);
    }
  }

  return (
    <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
      <InlineEdit
        value={board.name}
        label="Nome do quadro"
        onSave={(name) => renameBoard(board.id, name)}
        className="text-xl font-semibold"
      />
      <button type="button" className={btn} onClick={() => void archive()}>
        Arquivar quadro
      </button>
    </header>
  );
}
```

`src/ui/board/ColumnView.tsx`:
```tsx
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMemo } from "react";
import { cardsInColumn } from "../../domain/cards";
import type { Board, Column } from "../../domain/schema";
import { useApp } from "../context";
import { InlineEdit } from "../InlineEdit";
import { AddCardForm } from "./AddCardForm";
import { CardTile } from "./CardTile";
import { ColumnMenu } from "./ColumnMenu";
import { cardDndId, columnDndId } from "./dnd";

export function ColumnView({ board, column }: { board: Board; column: Column }) {
  const data = useApp((s) => s.data);
  const renameColumn = useApp((s) => s.renameColumn);
  const cards = useMemo(() => cardsInColumn(data, column.id), [data, column.id]);
  const hasAnyCards = data.cards.some((c) => c.columnId === column.id);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: columnDndId(column.id),
  });

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      aria-label={`Coluna ${column.name}`}
      className={`flex w-72 shrink-0 flex-col rounded-xl bg-zinc-100 p-2 dark:bg-zinc-900 ${isDragging ? "opacity-60" : ""}`}
    >
      <div className="mb-2 flex items-center gap-1">
        <span
          {...attributes}
          {...listeners}
          aria-label={`Arrastar coluna ${column.name}`}
          className="cursor-grab px-1 text-zinc-400 select-none"
        >
          ⋮⋮
        </span>
        <InlineEdit
          value={column.name}
          label="Nome da coluna"
          onSave={(name) => renameColumn(board.id, column.id, name)}
          className="text-sm font-semibold"
        />
        <span className="text-xs text-zinc-500">{cards.length}</span>
        {column.isDone && (
          <span className="rounded bg-emerald-100 px-1.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            Concluídos
          </span>
        )}
        <ColumnMenu board={board} column={column} hasCards={hasAnyCards} />
      </div>
      <SortableContext items={cards.map((c) => cardDndId(c.id))} strategy={verticalListSortingStrategy}>
        <ul className="flex min-h-8 flex-col gap-2">
          {cards.map((card) => (
            <CardTile key={card.id} card={card} inDoneColumn={column.isDone} />
          ))}
        </ul>
      </SortableContext>
      <AddCardForm boardId={board.id} columnId={column.id} />
    </section>
  );
}
```

`src/ui/board/ColumnMenu.tsx`:
```tsx
import { useState } from "react";
import { byOrder } from "../../domain/order";
import type { Board, Column } from "../../domain/schema";
import { useApp, usePlatform } from "../context";
import { btn, btnDanger, input, menuItem } from "../styles";

export function ColumnMenu({ board, column, hasCards }: { board: Board; column: Column; hasCards: boolean }) {
  const setDoneColumn = useApp((s) => s.setDoneColumn);
  const removeColumn = useApp((s) => s.removeColumn);
  const { confirm } = usePlatform();
  const others = [...board.columns].sort(byOrder).filter((c) => c.id !== column.id);
  const [choosingTarget, setChoosingTarget] = useState(false);
  const [target, setTarget] = useState(others[0]?.id ?? "");

  async function remove() {
    if (hasCards && !column.isDone) {
      setChoosingTarget(true);
      return;
    }
    if (column.isDone || (await confirm(`Remover a coluna "${column.name}"?`))) removeColumn(board.id, column.id);
  }

  return (
    <details className="relative ml-auto">
      <summary
        aria-label={`Opções da coluna ${column.name}`}
        className="cursor-pointer list-none rounded px-1.5 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800"
      >
        ⋯
      </summary>
      <div className="absolute right-0 z-10 mt-1 w-60 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
        <button
          type="button"
          className={menuItem}
          disabled={column.isDone}
          onClick={() => setDoneColumn(board.id, column.id)}
        >
          Usar como coluna de concluídos
        </button>
        {!choosingTarget ? (
          <button type="button" className={`${menuItem} text-red-600 dark:text-red-400`} onClick={() => void remove()}>
            Remover coluna
          </button>
        ) : (
          <div className="space-y-2 p-2 text-sm">
            <label className="block">
              Mover os cartões para
              <select
                aria-label="Coluna de destino"
                className={`${input} mt-1`}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                {others.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <button type="button" className={btnDanger} onClick={() => removeColumn(board.id, column.id, target)}>
                Remover e mover
              </button>
              <button type="button" className={btn} onClick={() => setChoosingTarget(false)}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
```
Remover a coluna de concluídos cai no domínio, que recusa com a mensagem "A coluna de concluídos não pode ser removida..." (vira aviso).

`src/ui/board/CardTile.tsx`:
```tsx
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { checklistProgress } from "../../domain/cards";
import type { Card } from "../../domain/schema";
import { useApp } from "../context";
import { formatShortDate } from "../format";
import { PriorityBadge } from "../PriorityBadge";
import { cardBox } from "../styles";
import { cardDndId } from "./dnd";

export function CardTile({ card, inDoneColumn }: { card: Card; inDoneColumn: boolean }) {
  const openCard = useApp((s) => s.openCard);
  const today = useApp((s) => s.today);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cardDndId(card.id) });
  const progress = checklistProgress(card);
  const overdue = !inDoneColumn && card.dueDate !== undefined && card.dueDate < today;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      role="listitem"
      className={`${cardBox} cursor-grab ${isDragging ? "opacity-50" : ""}`}
    >
      <button type="button" onClick={() => openCard(card.id)} className="w-full text-left text-sm">
        {card.title}
      </button>
      {(card.dueDate || card.priority || progress.total > 0) && (
        <div className="mt-1.5 flex items-center gap-2 text-xs text-zinc-500">
          {card.dueDate && (
            <span className={overdue ? "font-medium text-red-600 dark:text-red-400" : ""}>
              {formatShortDate(card.dueDate)}
            </span>
          )}
          {card.priority && <PriorityBadge priority={card.priority} />}
          {progress.total > 0 && (
            <span>
              {progress.done}/{progress.total}
            </span>
          )}
        </div>
      )}
    </li>
  );
}
```
`role="listitem"` depois de `{...attributes}` substitui o `role="button"` do dnd-kit: sem isso o item e o botão do título teriam o mesmo nome acessível.

`src/ui/board/AddCardForm.tsx`:
```tsx
import { useState } from "react";
import { useApp } from "../context";
import { btn, input } from "../styles";

export function AddCardForm({ boardId, columnId }: { boardId: string; columnId: string }) {
  const addCard = useApp((s) => s.addCard);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");

  if (!open) {
    return (
      <button type="button" className={`${btn} mt-2 w-full justify-start`} onClick={() => setOpen(true)}>
        + Adicionar cartão
      </button>
    );
  }

  return (
    <input
      autoFocus
      aria-label="Título do novo cartão"
      placeholder="Título do cartão"
      className={`${input} mt-2`}
      value={title}
      onChange={(e) => setTitle(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && addCard(boardId, columnId, title)) setTitle("");
        if (e.key === "Escape") {
          setTitle("");
          setOpen(false);
        }
      }}
      onBlur={() => {
        if (title.trim() === "") setOpen(false);
      }}
    />
  );
}
```

`src/ui/board/NewColumnForm.tsx`:
```tsx
import { useState } from "react";
import { useApp } from "../context";
import { btn, input } from "../styles";

export function NewColumnForm({ boardId }: { boardId: string }) {
  const addColumn = useApp((s) => s.addColumn);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  function close() {
    setName("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button type="button" className={`${btn} w-72 shrink-0 justify-start`} onClick={() => setOpen(true)}>
        + Nova coluna
      </button>
    );
  }

  return (
    <input
      autoFocus
      aria-label="Nome da nova coluna"
      placeholder="Nome da coluna"
      className={`${input} w-72 shrink-0`}
      value={name}
      onChange={(e) => setName(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && addColumn(boardId, name)) close();
        if (e.key === "Escape") close();
      }}
      onBlur={() => {
        if (name.trim() === "") close();
      }}
    />
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test src/ui && pnpm typecheck && pnpm lint`
Expected: todos passam; sem erros nem avisos de `act`. Se o jsdom não abrir o `<details>` ao clicar no `summary`, os botões continuam acessíveis e os testes passam do mesmo jeito; não troque o `<details>` por outro componente.

- [ ] **Step 5: Commit**

```bash
git add src/ui/board
git commit -m "feat(ui): tela do quadro com colunas, cartões e arrastar e soltar"
```

---

### Task 8: Detalhe do cartão

**Files:**
- Create: `src/ui/card/CardPanel.tsx`, `src/ui/card/ChecklistEditor.tsx`
- Test: `src/ui/card/CardPanel.test.tsx`

**Interfaces:**
- Consumes: `checklistProgress`; `Card`; `useApp`, `usePlatform`; `InlineEdit`; `toPriority`; `styles`; `react-markdown`. Ações: `updateCard`, `archiveCard`, `deleteCard`, `openCard`, `addChecklistItem`, `toggleChecklistItem`, `renameChecklistItem`, `removeChecklistItem`, `moveChecklistItem`.
- Produces: `CardPanel({ cardId })` (renderiza nada se o cartão não existir).

- [ ] **Step 1: Escrever o teste que falha**

`src/ui/card/CardPanel.test.tsx`:
```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { addCard, getCard } from "../../domain/cards";
import type { KambanData } from "../../domain/schema";
import { NOW } from "../../domain/testing";
import { setupApp } from "../testing";
import { CardPanel } from "./CardPanel";

afterEach(cleanup);

function seed(data: KambanData): KambanData {
  return addCard(data, { id: "k1", boardId: "id-1", columnId: "id-2", title: "Viagem", now: NOW });
}
const card = (store: Awaited<ReturnType<typeof setupApp>>["store"]) => getCard(store.getState().data, "k1");

describe("CardPanel", () => {
  it("edita o título ao sair do campo", async () => {
    const { store, user } = await setupApp(<CardPanel cardId="k1" />, { seed });
    const field = screen.getByRole("textbox", { name: "Título" });
    await user.clear(field);
    await user.type(field, "Viagem a SP");
    await user.tab();
    expect(card(store).title).toBe("Viagem a SP");
  });

  it("título vazio é recusado e volta ao anterior", async () => {
    const { store, user } = await setupApp(<CardPanel cardId="k1" />, { seed });
    const field = screen.getByRole("textbox", { name: "Título" });
    await user.clear(field);
    await user.tab();
    expect(card(store).title).toBe("Viagem");
    expect((field as HTMLInputElement).value).toBe("Viagem");
    expect(store.getState().notice).toBe("Título não pode ficar vazio.");
  });

  it("define e limpa prazo e prioridade", async () => {
    const { store, user } = await setupApp(<CardPanel cardId="k1" />, { seed });
    fireEvent.change(screen.getByLabelText("Prazo"), { target: { value: "2026-09-30" } });
    expect(card(store).dueDate).toBe("2026-09-30");
    fireEvent.change(screen.getByLabelText("Prazo"), { target: { value: "" } });
    expect(card(store).dueDate).toBeUndefined();
    await user.selectOptions(screen.getByLabelText("Prioridade"), "high");
    expect(card(store).priority).toBe("high");
    await user.selectOptions(screen.getByLabelText("Prioridade"), "");
    expect(card(store).priority).toBeUndefined();
  });

  it("descrição em Markdown com visualização", async () => {
    const { store, user } = await setupApp(<CardPanel cardId="k1" />, { seed });
    await user.type(screen.getByRole("textbox", { name: "Descrição" }), "Levar **documentos**");
    await user.click(screen.getByRole("button", { name: "Visualizar" }));
    expect(card(store).description).toBe("Levar **documentos**");
    expect(screen.getByText("documentos").tagName).toBe("STRONG");
    await user.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.getByRole("textbox", { name: "Descrição" })).toBeTruthy();
  });

  it("checklist: adiciona, marca, reordena e remove", async () => {
    const { store, user } = await setupApp(<CardPanel cardId="k1" />, { seed });
    const field = screen.getByRole("textbox", { name: "Novo item do checklist" });
    await user.type(field, "Passaporte{Enter}");
    await user.type(field, "Carregador{Enter}");
    expect(card(store).checklist.map((i) => i.text)).toEqual(["Passaporte", "Carregador"]);

    await user.click(screen.getByLabelText("Marcar Passaporte"));
    expect(card(store).checklist[0]!.done).toBe(true);
    expect(screen.getByText("Checklist (1/2)")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Descer Passaporte" }));
    expect(card(store).checklist.map((i) => i.text)).toEqual(["Carregador", "Passaporte"]);

    await user.click(screen.getByRole("button", { name: "Remover Carregador" }));
    expect(card(store).checklist.map((i) => i.text)).toEqual(["Passaporte"]);
  });

  it("arquiva o cartão", async () => {
    const { store, user } = await setupApp(<CardPanel cardId="k1" />, { seed });
    await user.click(screen.getByRole("button", { name: "Arquivar" }));
    expect(card(store).archived).toBe(true);
  });

  it("exclui o cartão depois de confirmar", async () => {
    const { store, user, platform } = await setupApp(<CardPanel cardId="k1" />, { seed });
    await user.click(screen.getByRole("button", { name: "Excluir" }));
    await waitFor(() => expect(store.getState().data.cards).toHaveLength(0));
    expect(platform.confirm).toHaveBeenCalledOnce();
  });

  it("fechar limpa a seleção", async () => {
    const { store, user } = await setupApp(<CardPanel cardId="k1" />, { seed });
    store.getState().openCard("k1");
    await user.click(screen.getByRole("button", { name: "Fechar detalhe" }));
    expect(store.getState().selectedCardId).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/ui/card`
Expected: FAIL, `Failed to resolve import "./CardPanel"`

- [ ] **Step 3: Implementar**

`src/ui/card/CardPanel.tsx`:
```tsx
import { useState } from "react";
import Markdown from "react-markdown";
import type { Card } from "../../domain/schema";
import { useApp, usePlatform } from "../context";
import { toPriority } from "../format";
import { btn, btnDanger, input, sectionTitle } from "../styles";
import { ChecklistEditor } from "./ChecklistEditor";

export function CardPanel({ cardId }: { cardId: string }) {
  const data = useApp((s) => s.data);
  const card = data.cards.find((c) => c.id === cardId);
  if (!card) return null;
  const boardName = data.boards.find((b) => b.id === card.boardId)?.name ?? "";
  return <CardEditor key={card.id} card={card} boardName={boardName} />;
}

function CardEditor({ card, boardName }: { card: Card; boardName: string }) {
  const updateCard = useApp((s) => s.updateCard);
  const archiveCard = useApp((s) => s.archiveCard);
  const deleteCard = useApp((s) => s.deleteCard);
  const openCard = useApp((s) => s.openCard);
  const { confirm, openUrl } = usePlatform();
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description ?? "");
  const [preview, setPreview] = useState(false);

  function saveTitle() {
    if (title.trim() === card.title) return;
    if (!updateCard(card.id, { title })) setTitle(card.title);
  }

  function saveDescription() {
    const next = description.trim() === "" ? undefined : description;
    if (next !== card.description) updateCard(card.id, { description: next });
  }

  async function remove() {
    if (await confirm(`Excluir "${card.title}" de vez? Isso não pode ser desfeito.`)) deleteCard(card.id);
  }

  return (
    <aside
      aria-label="Detalhe do cartão"
      className="flex w-[26rem] shrink-0 flex-col border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <span className="text-xs text-zinc-500">{boardName}</span>
        <button type="button" className={btn} aria-label="Fechar detalhe" onClick={() => openCard(null)}>
          ✕
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <input
          aria-label="Título"
          className="w-full bg-transparent text-lg font-semibold outline-none"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-500">
            Prazo
            <input
              type="date"
              className={`${input} mt-1`}
              value={card.dueDate ?? ""}
              onChange={(e) => updateCard(card.id, { dueDate: e.target.value || undefined })}
            />
          </label>
          <label className="text-xs text-zinc-500">
            Prioridade
            <select
              className={`${input} mt-1`}
              value={card.priority ?? ""}
              onChange={(e) => updateCard(card.id, { priority: toPriority(e.target.value) })}
            >
              <option value="">Sem prioridade</option>
              <option value="high">Alta</option>
              <option value="medium">Média</option>
              <option value="low">Baixa</option>
            </select>
          </label>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <h3 className={sectionTitle}>Descrição</h3>
            <button
              type="button"
              className={btn}
              onClick={() => {
                if (!preview) saveDescription();
                setPreview(!preview);
              }}
            >
              {preview ? "Editar" : "Visualizar"}
            </button>
          </div>
          {preview ? (
            <div className="space-y-2 text-sm [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">
              <Markdown
                components={{
                  a: ({ href, children }) => (
                    <a
                      href={href}
                      onClick={(e) => {
                        e.preventDefault();
                        if (href) void openUrl(href);
                      }}
                    >
                      {children}
                    </a>
                  ),
                }}
              >
                {description || "_Sem descrição._"}
              </Markdown>
            </div>
          ) : (
            <textarea
              aria-label="Descrição"
              rows={8}
              className={input}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={saveDescription}
              placeholder="Markdown: **negrito**, - listas, [link](https://exemplo.com)"
            />
          )}
        </div>

        <ChecklistEditor card={card} />
      </div>

      <div className="flex justify-between border-t border-zinc-200 p-3 dark:border-zinc-800">
        <button type="button" className={btn} onClick={() => archiveCard(card.id)}>
          Arquivar
        </button>
        <button type="button" className={btnDanger} onClick={() => void remove()}>
          Excluir
        </button>
      </div>
    </aside>
  );
}
```
Links da descrição abrem no navegador (via `openUrl`), nunca dentro da janela do app.

`src/ui/card/ChecklistEditor.tsx`:
```tsx
import { useState } from "react";
import { checklistProgress } from "../../domain/cards";
import type { Card } from "../../domain/schema";
import { useApp } from "../context";
import { InlineEdit } from "../InlineEdit";
import { btn, input, sectionTitle } from "../styles";

export function ChecklistEditor({ card }: { card: Card }) {
  const addItem = useApp((s) => s.addChecklistItem);
  const toggleItem = useApp((s) => s.toggleChecklistItem);
  const renameItem = useApp((s) => s.renameChecklistItem);
  const removeItem = useApp((s) => s.removeChecklistItem);
  const moveItem = useApp((s) => s.moveChecklistItem);
  const [text, setText] = useState("");
  const progress = checklistProgress(card);
  const last = card.checklist.length - 1;

  return (
    <section aria-label="Checklist">
      <h3 className={sectionTitle}>
        {progress.total > 0 ? `Checklist (${progress.done}/${progress.total})` : "Checklist"}
      </h3>
      <ul className="mt-2 space-y-1">
        {card.checklist.map((item, index) => (
          <li key={item.id} className="flex items-center gap-1">
            <input
              type="checkbox"
              aria-label={`Marcar ${item.text}`}
              checked={item.done}
              onChange={() => toggleItem(card.id, item.id)}
            />
            <InlineEdit
              value={item.text}
              label="Texto do item"
              onSave={(value) => renameItem(card.id, item.id, value)}
              className={`flex-1 text-sm ${item.done ? "text-zinc-400 line-through" : ""}`}
            />
            <button
              type="button"
              className={btn}
              aria-label={`Subir ${item.text}`}
              disabled={index === 0}
              onClick={() => moveItem(card.id, item.id, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              className={btn}
              aria-label={`Descer ${item.text}`}
              disabled={index === last}
              onClick={() => moveItem(card.id, item.id, 1)}
            >
              ↓
            </button>
            <button
              type="button"
              className={btn}
              aria-label={`Remover ${item.text}`}
              onClick={() => removeItem(card.id, item.id)}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <input
        aria-label="Novo item do checklist"
        placeholder="Adicionar item"
        className={`${input} mt-2`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && addItem(card.id, text)) setText("");
        }}
      />
    </section>
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test src/ui && pnpm typecheck && pnpm lint`
Expected: todos passam; sem erros nem avisos de `act`.

- [ ] **Step 5: Commit**

```bash
git add src/ui/card
git commit -m "feat(ui): detalhe do cartão com prazo, prioridade, descrição em Markdown e checklist"
```

---
### Task 9: Tela de Hábitos e lista reordenável

**Files:**
- Create: `src/ui/SortableList.tsx`, `src/ui/habits/HabitsView.tsx`, `src/ui/habits/ScheduleEditor.tsx`
- Test: `src/ui/habits/HabitsView.test.tsx`

**Interfaces:**
- Consumes: `activeHabits` (`domain/habits`); `Habit`, `HabitSchedule`; `useApp`; `InlineEdit`; `WEEKDAY_NAMES`, `WEEKDAY_INITIALS`; `styles`. Ações: `addHabit`, `updateHabit`, `archiveHabit`, `reorderHabits`.
- Produces:
  - `SortableList<T extends { id: string }>({ items, onReorder, label, renderItem: (item: T, handle: ReactNode) => ReactNode })`: lista vertical com alça de arrastar; `onReorder` recebe todos os ids na nova ordem. Usada também pela barra lateral (Task 11).
  - `ScheduleEditor({ value: HabitSchedule, onChange })`
  - `HabitsView()`

- [ ] **Step 1: Escrever o teste que falha**

`src/ui/habits/HabitsView.test.tsx`:
```tsx
// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { addHabit, getHabit } from "../../domain/habits";
import type { HabitSchedule, KambanData } from "../../domain/schema";
import { NOW } from "../../domain/testing";
import { setupApp } from "../testing";
import { HabitsView } from "./HabitsView";

afterEach(cleanup);

const withHabit = (schedule: HabitSchedule) => (data: KambanData) =>
  addHabit(data, { id: "h1", title: "Água", schedule, now: NOW });
const newForm = () => within(screen.getByRole("form", { name: "Novo hábito" }));
const list = () => within(screen.getByRole("list", { name: "Hábitos" }));

describe("HabitsView", () => {
  it("cria um hábito diário", async () => {
    const { store, user } = await setupApp(<HabitsView />);
    expect(screen.getByText("Nenhum hábito ainda.")).toBeTruthy();
    await user.type(newForm().getByRole("textbox", { name: "Nome do novo hábito" }), "Ler");
    await user.click(newForm().getByRole("button", { name: "Adicionar" }));
    list().getByText("Ler");
    expect(store.getState().data.habits[0]).toMatchObject({ title: "Ler", schedule: { type: "daily" } });
    expect((newForm().getByRole("textbox") as HTMLInputElement).value).toBe("");
  });

  it("cria um hábito em dias específicos", async () => {
    const { store, user } = await setupApp(<HabitsView />);
    await user.type(newForm().getByRole("textbox", { name: "Nome do novo hábito" }), "Academia");
    await user.selectOptions(newForm().getByRole("combobox", { name: "Programação" }), "custom");
    await user.click(newForm().getByRole("button", { name: "quarta" }));
    await user.click(newForm().getByRole("button", { name: "sexta" }));
    await user.click(newForm().getByRole("button", { name: "segunda" }));
    await user.click(newForm().getByRole("button", { name: "Adicionar" }));
    expect(store.getState().data.habits[0]!.schedule).toEqual({ type: "custom", days: [3, 5] });
  });

  it("renomeia, muda a programação e arquiva um hábito", async () => {
    const { store, user } = await setupApp(<HabitsView />, { seed: withHabit({ type: "daily" }) });
    await user.click(list().getByRole("button", { name: "Água" }));
    const field = list().getByRole("textbox", { name: "Nome do hábito" });
    await user.clear(field);
    await user.type(field, "Beber água{Enter}");
    await user.selectOptions(list().getByRole("combobox", { name: "Programação" }), "weekdays");
    expect(getHabit(store.getState().data, "h1")).toMatchObject({ title: "Beber água", schedule: { type: "weekdays" } });

    await user.click(list().getByRole("button", { name: "Arquivar" }));
    expect(getHabit(store.getState().data, "h1").archived).toBe(true);
    expect(screen.getByText("Nenhum hábito ainda.")).toBeTruthy();
  });

  it("desmarcar o último dia é recusado com aviso", async () => {
    const { store, user } = await setupApp(<HabitsView />, { seed: withHabit({ type: "custom", days: [3] }) });
    await user.click(list().getByRole("button", { name: "quarta" }));
    expect(getHabit(store.getState().data, "h1").schedule).toEqual({ type: "custom", days: [3] });
    expect(store.getState().notice).toBe("Escolha ao menos um dia da semana para o hábito.");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/ui/habits`
Expected: FAIL, `Failed to resolve import "./HabitsView"`

- [ ] **Step 3: Implementar**

`src/ui/SortableList.tsx`:
```tsx
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";

export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  label,
  renderItem,
}: {
  items: T[];
  onReorder: (orderedIds: string[]) => void;
  label: string;
  renderItem: (item: T, handle: ReactNode) => ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const ids = items.map((i) => i.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    onReorder(arrayMove(ids, from, to));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ul aria-label={label} className="space-y-1.5">
          {items.map((item) => (
            <SortableRow key={item.id} id={item.id}>
              {(handle) => renderItem(item, handle)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({ id, children }: { id: string; children: (handle: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const handle = (
    <span
      {...attributes}
      {...listeners}
      aria-label="Arrastar para reordenar"
      className="cursor-grab px-1 text-zinc-400 select-none"
    >
      ⋮⋮
    </span>
  );
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={isDragging ? "opacity-60" : ""}
    >
      {children(handle)}
    </li>
  );
}
```

`src/ui/habits/ScheduleEditor.tsx`:
```tsx
import type { HabitSchedule } from "../../domain/schema";
import { WEEKDAY_INITIALS, WEEKDAY_NAMES } from "../format";
import { input } from "../styles";

export function ScheduleEditor({ value, onChange }: { value: HabitSchedule; onChange: (value: HabitSchedule) => void }) {
  const days = value.type === "custom" ? value.days : [];

  function setType(type: string) {
    if (type === "daily" || type === "weekdays") onChange({ type });
    else onChange({ type: "custom", days: [1] });
  }

  function toggleDay(day: number) {
    const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b);
    onChange({ type: "custom", days: next });
  }

  return (
    <div className="flex items-center gap-2">
      <select
        aria-label="Programação"
        className={`${input} w-auto`}
        value={value.type}
        onChange={(e) => setType(e.target.value)}
      >
        <option value="daily">Todo dia</option>
        <option value="weekdays">Dias úteis</option>
        <option value="custom">Dias específicos</option>
      </select>
      {value.type === "custom" && (
        <div role="group" aria-label="Dias da semana" className="flex gap-1">
          {WEEKDAY_INITIALS.map((initial, day) => (
            <button
              key={day}
              type="button"
              aria-label={WEEKDAY_NAMES[day]}
              aria-pressed={days.includes(day)}
              onClick={() => toggleDay(day)}
              className={`h-7 w-7 rounded-full text-xs font-medium ${
                days.includes(day)
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
              }`}
            >
              {initial}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```
Ao escolher "Dias específicos", o hábito começa só com segunda. Desmarcar o último dia é recusado pelo domínio (vira aviso).

`src/ui/habits/HabitsView.tsx`:
```tsx
import { useMemo, useState, type ReactNode } from "react";
import { activeHabits } from "../../domain/habits";
import type { Habit, HabitSchedule } from "../../domain/schema";
import { useApp } from "../context";
import { InlineEdit } from "../InlineEdit";
import { SortableList } from "../SortableList";
import { btn, btnPrimary, cardBox, input } from "../styles";
import { ScheduleEditor } from "./ScheduleEditor";

export function HabitsView() {
  const data = useApp((s) => s.data);
  const reorderHabits = useApp((s) => s.reorderHabits);
  const habits = useMemo(() => activeHabits(data), [data]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <header>
        <h1 className="text-2xl font-semibold">Hábitos</h1>
        <p className="text-sm text-zinc-500">Aparecem na tela Hoje nos dias programados.</p>
      </header>
      <NewHabitForm />
      {habits.length === 0 ? (
        <p className="text-sm text-zinc-500">Nenhum hábito ainda.</p>
      ) : (
        <SortableList
          items={habits}
          onReorder={reorderHabits}
          label="Hábitos"
          renderItem={(habit, handle) => <HabitRow habit={habit} handle={handle} />}
        />
      )}
    </div>
  );
}

function HabitRow({ habit, handle }: { habit: Habit; handle: ReactNode }) {
  const updateHabit = useApp((s) => s.updateHabit);
  const archiveHabit = useApp((s) => s.archiveHabit);
  return (
    <div className={`${cardBox} flex flex-wrap items-center gap-3`}>
      {handle}
      <InlineEdit
        value={habit.title}
        label="Nome do hábito"
        onSave={(title) => updateHabit(habit.id, { title })}
        className="text-sm font-medium"
      />
      <ScheduleEditor value={habit.schedule} onChange={(schedule) => updateHabit(habit.id, { schedule })} />
      <button type="button" className={`${btn} ml-auto`} onClick={() => archiveHabit(habit.id)}>
        Arquivar
      </button>
    </div>
  );
}

function NewHabitForm() {
  const addHabit = useApp((s) => s.addHabit);
  const [title, setTitle] = useState("");
  const [schedule, setSchedule] = useState<HabitSchedule>({ type: "daily" });

  return (
    <form
      aria-label="Novo hábito"
      className={`${cardBox} flex flex-wrap items-center gap-3`}
      onSubmit={(e) => {
        e.preventDefault();
        if (addHabit(title, schedule)) {
          setTitle("");
          setSchedule({ type: "daily" });
        }
      }}
    >
      <input
        aria-label="Nome do novo hábito"
        placeholder="Novo hábito"
        className={`${input} max-w-xs`}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <ScheduleEditor value={schedule} onChange={setSchedule} />
      <button type="submit" className={btnPrimary}>
        Adicionar
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test src/ui && pnpm typecheck && pnpm lint`
Expected: todos passam; sem erros nem avisos de `act`.

- [ ] **Step 5: Commit**

```bash
git add src/ui/SortableList.tsx src/ui/habits
git commit -m "feat(ui): tela de hábitos com programação semanal e reordenação"
```

---

### Task 10: Tela de Configurações

**Files:**
- Create: `src/ui/settings/SettingsView.tsx`
- Test: `src/ui/settings/SettingsView.test.tsx`

**Interfaces:**
- Consumes: `BACKUP_DIR`, `joinPath` (`persistence/fs`); `useApp`, `usePlatform`; `styles`. Ações: `flush`, `openFolder`, `showNotice`.
- Produces: `SettingsView()`

- [ ] **Step 1: Escrever o teste que falha**

`src/ui/settings/SettingsView.test.tsx`:
```tsx
// @vitest-environment jsdom
import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setupApp } from "../testing";
import { SettingsView } from "./SettingsView";

afterEach(cleanup);

describe("SettingsView", () => {
  it("mostra a pasta de dados e troca de pasta gravando antes", async () => {
    const { store, fs, user } = await setupApp(<SettingsView />, { platform: { pickFolder: vi.fn(async () => "/outra") } });
    await fs.mkdir("/outra");
    expect(screen.getByText("/data")).toBeTruthy();
    store.getState().renameBoard("id-1", "Antes da troca");
    await user.click(screen.getByRole("button", { name: "Trocar pasta" }));
    await waitFor(() => expect(store.getState().dataDir).toBe("/outra"));
    expect(await fs.readText("/data/kamban.json")).toContain("Antes da troca");
    expect(await fs.exists("/outra/kamban.json")).toBe(true);
  });

  it("abre a pasta de backups no Finder", async () => {
    const { user, platform } = await setupApp(<SettingsView />);
    await user.click(screen.getByRole("button", { name: "Abrir backups no Finder" }));
    await waitFor(() => expect(platform.revealFolder).toHaveBeenCalledWith("/data/backups"));
  });

  it("se não conseguir abrir, tenta a pasta de dados e depois avisa", async () => {
    const revealFolder = vi.fn(async () => {
      throw new Error("sem acesso");
    });
    const { store, user } = await setupApp(<SettingsView />, { platform: { revealFolder } });
    await user.click(screen.getByRole("button", { name: "Abrir backups no Finder" }));
    await waitFor(() => expect(store.getState().notice).toContain("Não foi possível abrir a pasta"));
    expect(revealFolder).toHaveBeenCalledWith("/data");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/ui/settings`
Expected: FAIL, `Failed to resolve import "./SettingsView"`

- [ ] **Step 3: Implementar**

`src/ui/settings/SettingsView.tsx`:
```tsx
import { BACKUP_DIR, joinPath } from "../../persistence/fs";
import { useApp, usePlatform } from "../context";
import { btn, cardBox, sectionTitle } from "../styles";

export function SettingsView() {
  const dataDir = useApp((s) => s.dataDir);
  const flush = useApp((s) => s.flush);
  const openFolder = useApp((s) => s.openFolder);
  const showNotice = useApp((s) => s.showNotice);
  const { pickFolder, revealFolder } = usePlatform();

  async function changeFolder() {
    const dir = await pickFolder();
    if (!dir || dir === dataDir) return;
    await flush();
    await openFolder(dir);
  }

  async function openBackups() {
    if (!dataDir) return;
    try {
      await revealFolder(joinPath(dataDir, BACKUP_DIR));
    } catch {
      try {
        await revealFolder(dataDir);
      } catch (error) {
        showNotice(`Não foi possível abrir a pasta: ${String(error)}`);
      }
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Configurações</h1>
      <section className={`${cardBox} space-y-3 p-4`}>
        <h2 className={sectionTitle}>Pasta de dados</h2>
        <p className="font-mono text-sm break-all">{dataDir}</p>
        <div className="flex gap-2">
          <button type="button" className={btn} onClick={() => void changeFolder()}>
            Trocar pasta
          </button>
          <button type="button" className={btn} onClick={() => void openBackups()}>
            Abrir backups no Finder
          </button>
        </div>
        <p className="text-xs text-zinc-500">
          O app guarda uma cópia por dia em backups/, dentro da pasta, e mantém os últimos 14 dias.
        </p>
      </section>
    </div>
  );
}
```
A pasta `backups/` só existe depois do primeiro backup (a segunda gravação do primeiro dia). Antes disso, o app abre a própria pasta de dados.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test src/ui && pnpm typecheck && pnpm lint`
Expected: todos passam; sem erros nem avisos de `act`.

- [ ] **Step 5: Commit**

```bash
git add src/ui/settings
git commit -m "feat(ui): configurações com troca de pasta e acesso aos backups"
```

---

### Task 11: Estrutura do app (barra lateral, status de gravação e conflito)

**Files:**
- Create: `src/ui/Sidebar.tsx`, `src/ui/SaveIndicator.tsx`, `src/ui/ConflictDialog.tsx`
- Modify: `src/ui/Shell.tsx` (substitui o provisório)
- Test: `src/ui/Shell.test.tsx`

**Interfaces:**
- Consumes: `activeBoards`; `useApp`; `SortableList`; `TodayView`, `BoardView`, `HabitsView`, `SettingsView`, `CardPanel`; `styles`. Ações e estado: `view`, `setView`, `addBoard`, `reorderBoards`, `saveStatus`, `lastSaveFailed`, `conflict`, `resolveConflict`, `selectedCardId`.
- Produces: `Shell()`, `Sidebar()`, `SaveIndicator()`, `ConflictDialog()`

- [ ] **Step 1: Escrever o teste que falha**

`src/ui/Shell.test.tsx`:
```tsx
// @vitest-environment jsdom
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { addCard } from "../domain/cards";
import type { KambanData } from "../domain/schema";
import { NOW } from "../domain/testing";
import { App } from "./App";
import { setupApp } from "./testing";

afterEach(cleanup);

const nav = () => within(screen.getByRole("navigation", { name: "Navegação" }));
function seed(data: KambanData): KambanData {
  return addCard(data, { id: "k1", boardId: "id-1", columnId: "id-2", title: "Escrever relatório", now: NOW });
}

describe("Shell", () => {
  it("navega entre Hoje, quadro, Hábitos e Configurações", async () => {
    const { user } = await setupApp(<App />);
    expect(screen.getByRole("heading", { name: "Hoje" })).toBeTruthy();
    await user.click(nav().getByRole("button", { name: "To-do" }));
    expect(screen.getByRole("region", { name: "Coluna A fazer" })).toBeTruthy();
    await user.click(nav().getByRole("button", { name: "Hábitos" }));
    expect(screen.getByRole("heading", { name: "Hábitos" })).toBeTruthy();
    await user.click(nav().getByRole("button", { name: "Configurações" }));
    expect(screen.getByRole("heading", { name: "Configurações" })).toBeTruthy();
    await user.click(nav().getByRole("button", { name: "Hoje" }));
    expect(screen.getByRole("heading", { name: "Hoje" })).toBeTruthy();
  });

  it("cria um quadro pela barra lateral e abre", async () => {
    const { store, user } = await setupApp(<App />);
    await user.click(nav().getByRole("button", { name: "+ Novo quadro" }));
    await user.type(nav().getByRole("textbox", { name: "Nome do novo quadro" }), "Casa{Enter}");
    nav().getByRole("button", { name: "Casa" });
    const view = store.getState().view;
    expect(view.type === "board" && store.getState().data.boards.find((b) => b.id === view.boardId)?.name).toBe("Casa");
    expect(screen.getByRole("region", { name: "Coluna A fazer" })).toBeTruthy();
  });

  it("abre e fecha o detalhe do cartão a partir do quadro", async () => {
    const { user } = await setupApp(<App />, { seed });
    await user.click(nav().getByRole("button", { name: "To-do" }));
    await user.click(screen.getByRole("button", { name: "Escrever relatório" }));
    expect(screen.getByRole("complementary", { name: "Detalhe do cartão" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Fechar detalhe" }));
    expect(screen.queryByRole("complementary", { name: "Detalhe do cartão" })).toBeNull();
  });

  it("mostra o status de gravação e 'Não salvo' quando a gravação falha", async () => {
    const { store, fs } = await setupApp(<App />);
    const status = () => nav().getByRole("status", { name: "Status de gravação" });
    expect(status().textContent).toBe("Salvo");
    act(() => {
      store.getState().renameBoard("id-1", "Tarefas");
    });
    expect(status().textContent).toBe("Alterações pendentes");
    fs.failWrites = true;
    await act(async () => {
      await store.getState().flush();
    });
    expect(status().textContent).toBe("Não salvo");
  });

  it("pergunta qual versão manter quando há conflito", async () => {
    const { store, user } = await setupApp(<App />);
    act(() => {
      store.setState({ conflict: true });
    });
    expect(screen.getByRole("dialog", { name: "O arquivo mudou fora do app" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Usar a versão do disco" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/ui/Shell.test.tsx`
Expected: FAIL (o `Shell` provisório não tem navegação; os imports de `./Sidebar` etc. ainda não existem).

- [ ] **Step 3: Implementar**

`src/ui/SaveIndicator.tsx`:
```tsx
import { useApp } from "./context";

export function SaveIndicator() {
  const status = useApp((s) => s.saveStatus);
  const failed = useApp((s) => s.lastSaveFailed);
  const unsaved = failed || status === "error";
  const label = unsaved
    ? "Não salvo"
    : status === "saving"
      ? "Salvando…"
      : status === "pending"
        ? "Alterações pendentes"
        : "Salvo";
  return (
    <p
      role="status"
      aria-label="Status de gravação"
      className={`px-2 text-xs ${unsaved ? "font-medium text-red-600 dark:text-red-400" : "text-zinc-500"}`}
    >
      {label}
    </p>
  );
}
```
"Não salvo" fica visível desde a falha até uma gravação dar certo, mesmo se houver novas edições nesse meio tempo (spec, seção 6).

`src/ui/ConflictDialog.tsx`:
```tsx
import { useApp } from "./context";
import { btn, btnPrimary } from "./styles";

export function ConflictDialog() {
  const conflict = useApp((s) => s.conflict);
  const resolveConflict = useApp((s) => s.resolveConflict);
  if (!conflict) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="conflict-title"
        className="max-w-md space-y-4 rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900"
      >
        <h2 id="conflict-title" className="text-lg font-semibold">
          O arquivo mudou fora do app
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          O kamban.json foi alterado por outro programa ou por outro Mac, e há alterações suas que ainda não foram salvas.
          Qual versão manter? A outra será descartada.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" className={btn} onClick={() => void resolveConflict("disk")}>
            Usar a versão do disco
          </button>
          <button type="button" className={btnPrimary} onClick={() => void resolveConflict("app")}>
            Manter a versão do app
          </button>
        </div>
      </div>
    </div>
  );
}
```

`src/ui/Sidebar.tsx`:
```tsx
import { useMemo, useState } from "react";
import { activeBoards } from "../domain/boards";
import { useApp } from "./context";
import { SaveIndicator } from "./SaveIndicator";
import { SortableList } from "./SortableList";
import { btn, input, sectionTitle } from "./styles";

function navItem(active: boolean) {
  return `flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm ${
    active ? "bg-zinc-200 font-medium dark:bg-zinc-800" : "hover:bg-zinc-100 dark:hover:bg-zinc-900"
  }`;
}

export function Sidebar() {
  const data = useApp((s) => s.data);
  const view = useApp((s) => s.view);
  const setView = useApp((s) => s.setView);
  const addBoard = useApp((s) => s.addBoard);
  const reorderBoards = useApp((s) => s.reorderBoards);
  const boards = useMemo(() => activeBoards(data), [data]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  function closeForm() {
    setName("");
    setCreating(false);
  }

  function createBoard() {
    const id = addBoard(name);
    if (!id) return;
    closeForm();
    setView({ type: "board", boardId: id });
  }

  return (
    <nav
      aria-label="Navegação"
      className="flex w-60 shrink-0 flex-col gap-4 border-r border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40"
    >
      <div className="space-y-0.5">
        <button
          type="button"
          className={navItem(view.type === "today")}
          aria-current={view.type === "today" ? "page" : undefined}
          onClick={() => setView({ type: "today" })}
        >
          Hoje
        </button>
        <button
          type="button"
          className={navItem(view.type === "habits")}
          aria-current={view.type === "habits" ? "page" : undefined}
          onClick={() => setView({ type: "habits" })}
        >
          Hábitos
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <h2 className={`${sectionTitle} mb-1 px-2`}>Quadros</h2>
        <SortableList
          items={boards}
          onReorder={reorderBoards}
          label="Quadros"
          renderItem={(board, handle) => {
            const active = view.type === "board" && view.boardId === board.id;
            return (
              <div className="flex items-center">
                {handle}
                <button
                  type="button"
                  className={navItem(active)}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setView({ type: "board", boardId: board.id })}
                >
                  {board.name}
                </button>
              </div>
            );
          }}
        />
        {creating ? (
          <input
            autoFocus
            aria-label="Nome do novo quadro"
            placeholder="Nome do quadro"
            className={`${input} mt-1`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") createBoard();
              if (e.key === "Escape") closeForm();
            }}
            onBlur={() => {
              if (name.trim() === "") closeForm();
            }}
          />
        ) : (
          <button type="button" className={`${btn} mt-1 w-full justify-start`} onClick={() => setCreating(true)}>
            + Novo quadro
          </button>
        )}
      </div>

      <div className="space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <button
          type="button"
          className={navItem(view.type === "settings")}
          aria-current={view.type === "settings" ? "page" : undefined}
          onClick={() => setView({ type: "settings" })}
        >
          Configurações
        </button>
        <SaveIndicator />
      </div>
    </nav>
  );
}
```

`src/ui/Shell.tsx` (substitui o provisório):
```tsx
import { BoardView } from "./board/BoardView";
import { CardPanel } from "./card/CardPanel";
import { ConflictDialog } from "./ConflictDialog";
import { useApp } from "./context";
import { HabitsView } from "./habits/HabitsView";
import { SettingsView } from "./settings/SettingsView";
import { Sidebar } from "./Sidebar";
import { TodayView } from "./today/TodayView";

export function Shell() {
  const view = useApp((s) => s.view);
  const selectedCardId = useApp((s) => s.selectedCardId);
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-auto">
        {view.type === "today" && <TodayView />}
        {view.type === "board" && <BoardView key={view.boardId} boardId={view.boardId} />}
        {view.type === "habits" && <HabitsView />}
        {view.type === "settings" && <SettingsView />}
      </main>
      {selectedCardId && <CardPanel cardId={selectedCardId} />}
      <ConflictDialog />
    </div>
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`
Expected: tudo verde, sem avisos de `act` na saída.

- [ ] **Step 5: Commit**

```bash
git add src/ui
git commit -m "feat(ui): barra lateral, status de gravação e diálogo de conflito"
```

---

### Task 12: Verificação final e Pull Request

**Files:** nenhum arquivo novo.

- [ ] **Step 1: Rodar tudo do zero**

```bash
rm -rf node_modules dist && pnpm install --frozen-lockfile
pnpm typecheck && pnpm lint && pnpm test && pnpm build
source "$HOME/.cargo/env" && pnpm tauri build --debug --bundles app
ls src-tauri/target/debug/bundle/macos/Kamban.app
```
Expected: tudo verde e o `Kamban.app` gerado.

- [ ] **Step 2: Teste manual no app de verdade (pedir ao usuário)**

A interação com o app nativo não é automatizada. Peça ao usuário para rodar `pnpm tauri dev` (ou abrir `src-tauri/target/debug/bundle/macos/Kamban.app`) e conferir este roteiro:
1. Primeira abertura: escolher uma pasta no iCloud Drive; o `kamban.json` aparece na pasta.
2. Criar um quadro, cartões e colunas; arrastar cartões entre colunas e reordenar colunas.
3. Abrir um cartão: prazo, prioridade, descrição com link (abre no navegador) e checklist.
4. Criar hábitos e marcar na tela Hoje.
5. Fechar o app com o botão vermelho e reabrir: tudo continua lá.
6. Configurações > Abrir backups no Finder.

Registre no PR o que foi testado manualmente e o que não foi.

- [ ] **Step 3: Push e PR (confirmar com o usuário antes, é ação externa)**

```bash
git push -u origin feat/fase-2-app
gh pr create --base main --title "Fase 2: app Kamban (Tauri, telas e release)" --body-file <arquivo com o corpo do PR>
```
O corpo do PR resume as telas entregues, aponta a spec e este plano, lista o resultado do teste manual e termina com a linha `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

- [ ] **Step 4: Confirmar que o CI passou**

Run: `gh pr checks --watch`
Expected: job `check` verde. O workflow `release.yml` só roda quando uma tag `v*` é criada; criar a tag `v0.1.0` é decisão do usuário, depois do merge.
