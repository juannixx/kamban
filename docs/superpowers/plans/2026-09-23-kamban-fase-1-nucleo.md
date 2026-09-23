# Kamban Fase 1 (Núcleo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o projeto (Vite + React + TypeScript + pnpm), o CI no GitHub Actions e todo o núcleo testado do Kamban: modelo de dados, regras de quadros, colunas, cartões, hábitos, tela Hoje e a camada de persistência (leitura, validação, migração, gravação atômica, backups e agendador de gravação).

**Architecture:** `src/domain/` contém funções puras que recebem `KambanData` e devolvem um novo `KambanData`, sem React, sem Tauri, sem relógio e sem gerador de id (ids e horários chegam como parâmetros). `src/persistence/` depende apenas de uma interface `FileSystem`; nos testes ela é implementada por `MemoryFs`, e na Fase 2 por `@tauri-apps/plugin-fs`. Nenhuma interface gráfica real nesta fase: `App.tsx` é só um placeholder para o build funcionar.

**Tech Stack:** pnpm 12, Node 24 no CI, TypeScript ~6.0, Vite 8, React 19, Zod 4, Vitest 5, ESLint 10 com typescript-eslint 8.

**Spec:** `docs/superpowers/specs/2026-09-23-kamban-design.md`

## Global Constraints

- TypeScript fixado em `~6.0` (typescript-eslint 8.70 exige `<6.1.0`).
- `strict: true` e `noUncheckedIndexedAccess: true` no `tsconfig.json`.
- Datas de dia são `ISODate` no formato `YYYY-MM-DD`, sempre do dia local. Carimbos de tempo são ISO 8601 (`new Date().toISOString()`).
- Funções de `domain/` são puras: nunca chamam `Date`, `crypto.randomUUID()` nem nada de I/O. Recebem `id` e `now` como parâmetros.
- Erros de regra de negócio lançam `DomainError` com mensagem em português.
- Nome do arquivo de dados: `kamban.json`; temporário: `kamban.json.tmp`; backups: `backups/kamban-YYYY-MM-DD.json`; manter 14 backups.
- Debounce de gravação: 500 ms. Nova tentativa após falha: 5000 ms.
- Colunas padrão de quadro novo: "A fazer", "Fazendo", "Feito" (esta com `isDone: true`). Quadro inicial: "To-do".
- Nunca commitar na `main`. Toda a Fase 1 é feita na branch `feat/fase-1-nucleo` e entregue num único PR.
- Toda mensagem de commit termina com a linha `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` (omitida nos exemplos abaixo por brevidade; incluir sempre).

## File Structure

```
package.json, pnpm-lock.yaml, tsconfig.json, vite.config.ts, eslint.config.js, index.html, .gitignore
.github/workflows/ci.yml
src/
  main.tsx, App.tsx                 placeholder de UI (substituído na Fase 2)
  domain/
    dates.ts        toISODate, weekdayOf
    errors.ts       DomainError, requireText
    order.ts        nextOrder, byOrder, applyOrder
    schema.ts       schemas Zod, tipos inferidos, CURRENT_VERSION
    boards.ts       dados iniciais, CRUD de quadro, getBoard, getColumn, getDoneColumn, updateBoard
    cards.ts        CRUD e movimentação de cartão, withCompletion, consultas
    columns.ts      CRUD de coluna, coluna "Feito", remoção com destino
    habits.ts       programação, CRUD de hábito, marcar/desmarcar
    today.ts        buildToday
    testing.ts      fixtures compartilhadas pelos testes
    *.test.ts       um arquivo de teste por módulo
  persistence/
    fs.ts           interface FileSystem, nomes de arquivo, joinPath
    memoryFs.ts     implementação em memória para testes
    load.ts         parseData, migrate, loadData
    backups.ts      backupName, listBackups, rotateBackups, backupIfNeeded
    save.ts         serialize, writeAtomic, saveData
    restore.ts      restoreLatestBackup
    saveScheduler.ts createSaveScheduler
    *.test.ts
```

## Fora desta fase (vai para a Fase 2)

Shell Tauri e implementação real de `FileSystem` com `@tauri-apps/plugin-fs`, store Zustand, todas as telas, detecção de alteração externa do arquivo (comparação de mtime ao ganhar foco), recálculo do "hoje" à meia-noite, escolha e troca da pasta de dados, e o workflow `release.yml`. A Fase 1 entrega as peças que essas partes usam: `loadData`, `saveData`, `restoreLatestBackup`, `createSaveScheduler` e todas as funções de `domain/`.

---

### Task 1: Scaffold do projeto, CI e utilitário de datas

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `eslint.config.js`, `index.html`, `.gitignore`, `src/main.tsx`, `src/App.tsx`, `.github/workflows/ci.yml`
- Create: `src/domain/dates.ts`
- Test: `src/domain/dates.test.ts`

**Interfaces:**
- Produces: `toISODate(date: Date): string`, `weekdayOf(isoDate: string): number` (0 = domingo ... 6 = sábado). Scripts `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

- [ ] **Step 1: Criar a branch e instalar o pnpm**

```bash
git checkout -b feat/fase-1-nucleo
npm install -g pnpm@12.6.0
pnpm -v
```
Expected: `12.6.0`

- [ ] **Step 2: Criar os arquivos de configuração**

`package.json`:
```json
{
  "name": "kamban",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "packageManager": "pnpm@12.6.0",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "types": ["node"]
  },
  "include": ["src", "vite.config.ts"]
}
```

`vite.config.ts`:
```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
```

`eslint.config.js`:
```js
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "src-tauri", "coverage"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
);
```

`index.html`:
```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Kamban</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`.gitignore`:
```
node_modules
dist
coverage
src-tauri/target
.DS_Store
*.log
```

`src/main.tsx`:
```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("Elemento #root não encontrado");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/App.tsx`:
```tsx
export function App() {
  return <p>Kamban</p>;
}
```

- [ ] **Step 3: Instalar as dependências**

```bash
pnpm add react react-dom zod
pnpm add -D typescript@~6.0 vite @vitejs/plugin-react vitest @types/react @types/react-dom @types/node eslint @eslint/js typescript-eslint globals
```
Expected: `pnpm-lock.yaml` criado, sem erro de peer dependency de `typescript`. Se o pnpm pedir aprovação de build scripts (`pnpm approve-builds`), aprovar apenas `esbuild` se aparecer.

- [ ] **Step 4: Escrever o teste que falha**

`src/domain/dates.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { toISODate, weekdayOf } from "./dates";

describe("toISODate", () => {
  it("formata a data local como YYYY-MM-DD com zeros à esquerda", () => {
    expect(toISODate(new Date(2026, 8, 3))).toBe("2026-09-03");
    expect(toISODate(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
  });
});

describe("weekdayOf", () => {
  it("retorna 0 para domingo e 6 para sábado", () => {
    expect(weekdayOf("2026-09-27")).toBe(0);
    expect(weekdayOf("2026-09-21")).toBe(1);
    expect(weekdayOf("2026-09-23")).toBe(3);
    expect(weekdayOf("2026-09-26")).toBe(6);
  });
});
```

- [ ] **Step 5: Rodar e ver falhar**

Run: `pnpm test`
Expected: FAIL, `Failed to resolve import "./dates"`

- [ ] **Step 6: Implementar**

`src/domain/dates.ts`:
```ts
/** Converte uma Date para "YYYY-MM-DD" usando o fuso local. */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Dia da semana de uma data "YYYY-MM-DD": 0 = domingo ... 6 = sábado. */
export function weekdayOf(isoDate: string): number {
  const [y = 0, m = 1, d = 1] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}
```

- [ ] **Step 7: Rodar todas as verificações**

```bash
pnpm test && pnpm typecheck && pnpm lint && pnpm build
```
Expected: 2 testes passam; typecheck, lint e build sem erros.

- [ ] **Step 8: Criar o workflow de CI**

`.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm build
```
(`pnpm/action-setup` lê a versão do campo `packageManager` do `package.json`.)

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + TS, CI e utilitário de datas"
```

---

### Task 2: Schema de dados

**Files:**
- Create: `src/domain/schema.ts`, `src/domain/testing.ts`
- Test: `src/domain/schema.test.ts`

**Interfaces:**
- Produces:
  - `CURRENT_VERSION = 1`
  - Schemas: `columnSchema`, `boardSchema`, `checklistItemSchema`, `prioritySchema`, `cardSchema`, `habitScheduleSchema`, `habitSchema`, `habitLogEntrySchema`, `kambanDataSchema`
  - Tipos: `Column`, `Board`, `ChecklistItem`, `Priority`, `Card`, `HabitSchedule`, `Habit`, `HabitLogEntry`, `KambanData`
  - Fixtures em `testing.ts`: `NOW = "2026-09-23T12:00:00.000Z"`, `LATER = "2026-09-23T13:00:00.000Z"`, `makeCard(overrides: Partial<Card> & Pick<Card, "id" | "boardId" | "columnId">): Card`, `makeHabit(overrides: Partial<Habit> & Pick<Habit, "id">): Habit`

- [ ] **Step 1: Escrever as fixtures e o teste que falha**

`src/domain/testing.ts`:
```ts
import type { Card, Habit } from "./schema";

export const NOW = "2026-09-23T12:00:00.000Z";
export const LATER = "2026-09-23T13:00:00.000Z";

export function makeCard(
  overrides: Partial<Card> & Pick<Card, "id" | "boardId" | "columnId">,
): Card {
  return {
    order: 0,
    title: `Cartão ${overrides.id}`,
    checklist: [],
    archived: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function makeHabit(overrides: Partial<Habit> & Pick<Habit, "id">): Habit {
  return {
    title: `Hábito ${overrides.id}`,
    order: 0,
    archived: false,
    schedule: { type: "daily" },
    createdAt: NOW,
    ...overrides,
  };
}
```

`src/domain/schema.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { kambanDataSchema, type KambanData } from "./schema";
import { makeCard, makeHabit } from "./testing";

function validData(): KambanData {
  return {
    version: 1,
    boards: [
      {
        id: "b1",
        name: "To-do",
        order: 0,
        archived: false,
        columns: [
          { id: "c1", name: "A fazer", order: 0, isDone: false },
          { id: "c2", name: "Feito", order: 1, isDone: true },
        ],
      },
    ],
    cards: [makeCard({ id: "k1", boardId: "b1", columnId: "c1", dueDate: "2026-09-23", priority: "high" })],
    habits: [makeHabit({ id: "h1", schedule: { type: "custom", days: [1, 3, 5] } })],
    habitLog: [{ habitId: "h1", date: "2026-09-23" }],
  };
}

describe("kambanDataSchema", () => {
  it("aceita dados válidos", () => {
    expect(kambanDataSchema.safeParse(validData()).success).toBe(true);
  });

  it("rejeita quadro sem exatamente uma coluna isDone", () => {
    const data = validData();
    data.boards[0]!.columns[1]!.isDone = false;
    expect(kambanDataSchema.safeParse(data).success).toBe(false);

    const two = validData();
    two.boards[0]!.columns[0]!.isDone = true;
    expect(kambanDataSchema.safeParse(two).success).toBe(false);
  });

  it("rejeita dueDate fora do formato YYYY-MM-DD", () => {
    const data = validData();
    data.cards[0]!.dueDate = "23/09/2026";
    expect(kambanDataSchema.safeParse(data).success).toBe(false);
  });

  it("rejeita hábito custom sem dias ou com dia fora de 0..6", () => {
    const empty = validData();
    empty.habits[0]!.schedule = { type: "custom", days: [] };
    expect(kambanDataSchema.safeParse(empty).success).toBe(false);

    const outOfRange = validData();
    outOfRange.habits[0]!.schedule = { type: "custom", days: [7] };
    expect(kambanDataSchema.safeParse(outOfRange).success).toBe(false);
  });

  it("rejeita versão diferente da atual", () => {
    expect(kambanDataSchema.safeParse({ ...validData(), version: 2 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/domain/schema.test.ts`
Expected: FAIL, `Failed to resolve import "./schema"`

- [ ] **Step 3: Implementar**

`src/domain/schema.ts`:
```ts
import { z } from "zod";

export const CURRENT_VERSION = 1;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve estar no formato YYYY-MM-DD");
const isoDateTime = z.iso.datetime();

export const columnSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  order: z.number(),
  isDone: z.boolean(),
});

export const boardSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    order: z.number(),
    columns: z.array(columnSchema),
    archived: z.boolean(),
  })
  .refine((board) => board.columns.filter((c) => c.isDone).length === 1, {
    message: "Cada quadro precisa ter exatamente uma coluna de concluídos",
  });

export const checklistItemSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  done: z.boolean(),
});

export const prioritySchema = z.enum(["low", "medium", "high"]);

export const cardSchema = z.object({
  id: z.string().min(1),
  boardId: z.string().min(1),
  columnId: z.string().min(1),
  order: z.number(),
  title: z.string(),
  description: z.string().optional(),
  dueDate: isoDate.optional(),
  priority: prioritySchema.optional(),
  checklist: z.array(checklistItemSchema),
  archived: z.boolean(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  completedAt: isoDateTime.optional(),
});

export const habitScheduleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("daily") }),
  z.object({ type: z.literal("weekdays") }),
  z.object({ type: z.literal("custom"), days: z.array(z.number().int().min(0).max(6)).min(1) }),
]);

export const habitSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  order: z.number(),
  archived: z.boolean(),
  schedule: habitScheduleSchema,
  createdAt: isoDateTime,
});

export const habitLogEntrySchema = z.object({
  habitId: z.string().min(1),
  date: isoDate,
});

export const kambanDataSchema = z.object({
  version: z.literal(CURRENT_VERSION),
  boards: z.array(boardSchema),
  cards: z.array(cardSchema),
  habits: z.array(habitSchema),
  habitLog: z.array(habitLogEntrySchema),
});

export type Column = z.infer<typeof columnSchema>;
export type Board = z.infer<typeof boardSchema>;
export type ChecklistItem = z.infer<typeof checklistItemSchema>;
export type Priority = z.infer<typeof prioritySchema>;
export type Card = z.infer<typeof cardSchema>;
export type HabitSchedule = z.infer<typeof habitScheduleSchema>;
export type Habit = z.infer<typeof habitSchema>;
export type HabitLogEntry = z.infer<typeof habitLogEntrySchema>;
export type KambanData = z.infer<typeof kambanDataSchema>;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test src/domain/schema.test.ts && pnpm typecheck`
Expected: 5 testes passam, typecheck sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/domain/schema.ts src/domain/schema.test.ts src/domain/testing.ts
git commit -m "feat(domain): schema Zod e tipos do modelo de dados"
```

---

### Task 3: Quadros, ordenação e erros de domínio

**Files:**
- Create: `src/domain/errors.ts`, `src/domain/order.ts`, `src/domain/boards.ts`
- Test: `src/domain/order.test.ts`, `src/domain/boards.test.ts`

**Interfaces:**
- Consumes: tipos de `schema.ts` (Task 2).
- Produces:
  - `class DomainError extends Error`
  - `requireText(value: string, label: string): string` (retorna o texto sem espaços nas pontas; lança `DomainError` se vazio)
  - `nextOrder(items: readonly { order: number }[]): number`
  - `byOrder(a: { order: number }, b: { order: number }): number`
  - `applyOrder<T extends { id: string; order: number }>(items: readonly T[], orderedIds: readonly string[]): T[]`
  - `interface NewBoardInput { id: string; name: string; columnIds: [string, string, string] }`
  - `createEmptyData(): KambanData`
  - `createInitialData(input: Omit<NewBoardInput, "name">): KambanData`
  - `addBoard(data: KambanData, input: NewBoardInput): KambanData`
  - `renameBoard(data: KambanData, boardId: string, name: string): KambanData`
  - `archiveBoard(data: KambanData, boardId: string): KambanData`
  - `reorderBoards(data: KambanData, orderedIds: readonly string[]): KambanData`
  - `activeBoards(data: KambanData): Board[]`
  - `getBoard(data: KambanData, boardId: string): Board`
  - `getColumn(board: Board, columnId: string): Column`
  - `getDoneColumn(board: Board): Column`
  - `updateBoard(data: KambanData, boardId: string, fn: (board: Board) => Board): KambanData`

- [ ] **Step 1: Escrever os testes que falham**

`src/domain/order.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { applyOrder, byOrder, nextOrder } from "./order";

describe("nextOrder", () => {
  it("retorna 0 para lista vazia e max + 1 caso contrário", () => {
    expect(nextOrder([])).toBe(0);
    expect(nextOrder([{ order: 3 }, { order: 1 }])).toBe(4);
  });
});

describe("byOrder", () => {
  it("ordena de forma crescente", () => {
    expect([{ order: 2 }, { order: 0 }].sort(byOrder)).toEqual([{ order: 0 }, { order: 2 }]);
  });
});

describe("applyOrder", () => {
  it("atribui order pela posição na lista de ids e mantém os demais", () => {
    const items = [
      { id: "a", order: 0 },
      { id: "b", order: 1 },
      { id: "c", order: 2 },
    ];
    expect(applyOrder(items, ["c", "a"])).toEqual([
      { id: "a", order: 1 },
      { id: "b", order: 1 },
      { id: "c", order: 0 },
    ]);
  });
});
```

`src/domain/boards.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  activeBoards,
  addBoard,
  archiveBoard,
  createEmptyData,
  createInitialData,
  getBoard,
  getDoneColumn,
  renameBoard,
  reorderBoards,
} from "./boards";
import { DomainError } from "./errors";
import { kambanDataSchema } from "./schema";

const ids = { id: "b1", columnIds: ["c1", "c2", "c3"] as [string, string, string] };

describe("createInitialData", () => {
  it("cria um quadro To-do com as três colunas padrão e dados válidos", () => {
    const data = createInitialData(ids);
    expect(data.boards).toHaveLength(1);
    const board = data.boards[0]!;
    expect(board.name).toBe("To-do");
    expect(board.columns.map((c) => [c.name, c.isDone])).toEqual([
      ["A fazer", false],
      ["Fazendo", false],
      ["Feito", true],
    ]);
    expect(kambanDataSchema.safeParse(data).success).toBe(true);
  });
});

describe("addBoard", () => {
  it("adiciona ao final com order seguinte e nome sem espaços nas pontas", () => {
    const data = addBoard(createInitialData(ids), {
      id: "b2",
      name: "  Casa ",
      columnIds: ["d1", "d2", "d3"],
    });
    expect(data.boards[1]).toMatchObject({ id: "b2", name: "Casa", order: 1, archived: false });
  });

  it("rejeita nome vazio", () => {
    expect(() =>
      addBoard(createEmptyData(), { id: "b2", name: "   ", columnIds: ["d1", "d2", "d3"] }),
    ).toThrow(DomainError);
  });
});

describe("renameBoard / archiveBoard / reorderBoards / activeBoards", () => {
  it("renomeia, arquiva e reordena", () => {
    let data = addBoard(createInitialData(ids), { id: "b2", name: "Casa", columnIds: ["d1", "d2", "d3"] });
    data = addBoard(data, { id: "b3", name: "Projeto X", columnIds: ["e1", "e2", "e3"] });
    data = renameBoard(data, "b1", "Tarefas");
    data = reorderBoards(data, ["b3", "b1", "b2"]);
    data = archiveBoard(data, "b2");

    expect(getBoard(data, "b1").name).toBe("Tarefas");
    expect(activeBoards(data).map((b) => b.id)).toEqual(["b3", "b1"]);
  });

  it("lança DomainError para quadro inexistente", () => {
    expect(() => renameBoard(createEmptyData(), "nope", "X")).toThrow(DomainError);
  });
});

describe("getDoneColumn", () => {
  it("retorna a coluna isDone", () => {
    const board = getBoard(createInitialData(ids), "b1");
    expect(getDoneColumn(board).id).toBe("c3");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/domain/order.test.ts src/domain/boards.test.ts`
Expected: FAIL, imports `./order` e `./boards` não resolvidos.

- [ ] **Step 3: Implementar**

`src/domain/errors.ts`:
```ts
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
```

`src/domain/order.ts`:
```ts
interface Ordered {
  order: number;
}

export function nextOrder(items: readonly Ordered[]): number {
  return items.length === 0 ? 0 : Math.max(...items.map((i) => i.order)) + 1;
}

export function byOrder(a: Ordered, b: Ordered): number {
  return a.order - b.order;
}

/** Define `order` de cada item pela posição do seu id em `orderedIds`. Itens fora da lista ficam como estão. */
export function applyOrder<T extends { id: string; order: number }>(
  items: readonly T[],
  orderedIds: readonly string[],
): T[] {
  return items.map((item) => {
    const index = orderedIds.indexOf(item.id);
    return index === -1 ? item : { ...item, order: index };
  });
}
```

`src/domain/boards.ts`:
```ts
import { DomainError, requireText } from "./errors";
import { applyOrder, byOrder, nextOrder } from "./order";
import { CURRENT_VERSION, type Board, type Column, type KambanData } from "./schema";

export interface NewBoardInput {
  id: string;
  name: string;
  columnIds: [string, string, string];
}

export function createEmptyData(): KambanData {
  return { version: CURRENT_VERSION, boards: [], cards: [], habits: [], habitLog: [] };
}

export function createInitialData(input: Omit<NewBoardInput, "name">): KambanData {
  return addBoard(createEmptyData(), { ...input, name: "To-do" });
}

export function addBoard(data: KambanData, input: NewBoardInput): KambanData {
  const [todo, doing, done] = input.columnIds;
  const board: Board = {
    id: input.id,
    name: requireText(input.name, "Nome do quadro"),
    order: nextOrder(data.boards),
    archived: false,
    columns: [
      { id: todo, name: "A fazer", order: 0, isDone: false },
      { id: doing, name: "Fazendo", order: 1, isDone: false },
      { id: done, name: "Feito", order: 2, isDone: true },
    ],
  };
  return { ...data, boards: [...data.boards, board] };
}

export function getBoard(data: KambanData, boardId: string): Board {
  const board = data.boards.find((b) => b.id === boardId);
  if (!board) throw new DomainError(`Quadro não encontrado: ${boardId}`);
  return board;
}

export function getColumn(board: Board, columnId: string): Column {
  const column = board.columns.find((c) => c.id === columnId);
  if (!column) throw new DomainError(`Coluna não encontrada: ${columnId}`);
  return column;
}

export function getDoneColumn(board: Board): Column {
  const column = board.columns.find((c) => c.isDone);
  if (!column) throw new DomainError(`O quadro ${board.name} não tem coluna de concluídos.`);
  return column;
}

export function updateBoard(
  data: KambanData,
  boardId: string,
  fn: (board: Board) => Board,
): KambanData {
  getBoard(data, boardId);
  return { ...data, boards: data.boards.map((b) => (b.id === boardId ? fn(b) : b)) };
}

export function renameBoard(data: KambanData, boardId: string, name: string): KambanData {
  const trimmed = requireText(name, "Nome do quadro");
  return updateBoard(data, boardId, (b) => ({ ...b, name: trimmed }));
}

export function archiveBoard(data: KambanData, boardId: string): KambanData {
  return updateBoard(data, boardId, (b) => ({ ...b, archived: true }));
}

export function reorderBoards(data: KambanData, orderedIds: readonly string[]): KambanData {
  return { ...data, boards: applyOrder(data.boards, orderedIds) };
}

export function activeBoards(data: KambanData): Board[] {
  return data.boards.filter((b) => !b.archived).sort(byOrder);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test src/domain && pnpm typecheck && pnpm lint`
Expected: todos os testes de `src/domain` passam; typecheck e lint sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/domain
git commit -m "feat(domain): quadros, ordenação e DomainError"
```

---

### Task 4: Cartões

**Files:**
- Create: `src/domain/cards.ts`
- Test: `src/domain/cards.test.ts`

**Interfaces:**
- Consumes: `getBoard`, `getColumn`, `getDoneColumn`, `createInitialData` (Task 3); `nextOrder`, `byOrder`; `requireText`, `DomainError`; `NOW`, `LATER` (Task 2).
- Produces:
  - `interface NewCardInput { id: string; boardId: string; columnId: string; title: string; now: string }`
  - `type CardPatch = Partial<Pick<Card, "title" | "description" | "dueDate" | "priority" | "checklist">>` (chave presente com `undefined` limpa o campo)
  - `interface MoveCardInput { cardId: string; toColumnId: string; toIndex: number; now: string }`
  - `withCompletion(card: Card, inDoneColumn: boolean, now: string): Card`
  - `addCard(data, input: NewCardInput): KambanData`
  - `getCard(data, cardId: string): Card`
  - `updateCard(data, cardId: string, patch: CardPatch, now: string): KambanData`
  - `moveCard(data, input: MoveCardInput): KambanData`
  - `completeCard(data, cardId: string, now: string): KambanData`
  - `archiveCard(data, cardId: string, now: string): KambanData`
  - `deleteCard(data, cardId: string): KambanData`
  - `cardsInColumn(data, columnId: string): Card[]` (não arquivados, por `order`)
  - `checklistProgress(card: Card): { done: number; total: number }`

- [ ] **Step 1: Escrever o teste que falha**

`src/domain/cards.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { createInitialData } from "./boards";
import {
  addCard,
  archiveCard,
  cardsInColumn,
  checklistProgress,
  completeCard,
  deleteCard,
  getCard,
  moveCard,
  updateCard,
} from "./cards";
import { DomainError } from "./errors";
import type { KambanData } from "./schema";
import { LATER, NOW } from "./testing";

// b1: c-todo (A fazer), c-doing (Fazendo), c-done (Feito, isDone)
function base(): KambanData {
  return createInitialData({ id: "b1", columnIds: ["c-todo", "c-doing", "c-done"] });
}

function withCards(...titles: string[]): KambanData {
  return titles.reduce(
    (data, title, i) =>
      addCard(data, { id: `k${i + 1}`, boardId: "b1", columnId: "c-todo", title, now: NOW }),
    base(),
  );
}

const ids = (cards: { id: string }[]) => cards.map((c) => c.id);

describe("addCard", () => {
  it("cria o cartão no fim da coluna, com checklist vazio e datas", () => {
    const data = withCards("A", "B");
    expect(getCard(data, "k2")).toMatchObject({
      title: "B",
      columnId: "c-todo",
      order: 1,
      checklist: [],
      archived: false,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(getCard(data, "k2").completedAt).toBeUndefined();
  });

  it("preenche completedAt quando criado na coluna isDone", () => {
    const data = addCard(base(), { id: "k1", boardId: "b1", columnId: "c-done", title: "X", now: NOW });
    expect(getCard(data, "k1").completedAt).toBe(NOW);
  });

  it("rejeita título vazio e coluna inexistente", () => {
    expect(() => addCard(base(), { id: "k1", boardId: "b1", columnId: "c-todo", title: " ", now: NOW })).toThrow(DomainError);
    expect(() => addCard(base(), { id: "k1", boardId: "b1", columnId: "nope", title: "X", now: NOW })).toThrow(DomainError);
  });
});

describe("updateCard", () => {
  it("aplica o patch, atualiza updatedAt e limpa campos com undefined", () => {
    let data = withCards("A");
    data = updateCard(data, "k1", { description: "**nota**", dueDate: "2026-09-30", priority: "high" }, NOW);
    data = updateCard(data, "k1", { priority: undefined, title: "  A2 " }, LATER);
    expect(getCard(data, "k1")).toMatchObject({ title: "A2", description: "**nota**", dueDate: "2026-09-30", updatedAt: LATER });
    expect(getCard(data, "k1").priority).toBeUndefined();
  });

  it("rejeita título vazio", () => {
    expect(() => updateCard(withCards("A"), "k1", { title: "" }, NOW)).toThrow(DomainError);
  });
});

describe("moveCard", () => {
  it("reordena dentro da mesma coluna", () => {
    const data = moveCard(withCards("A", "B", "C"), { cardId: "k3", toColumnId: "c-todo", toIndex: 0, now: LATER });
    expect(ids(cardsInColumn(data, "c-todo"))).toEqual(["k3", "k1", "k2"]);
  });

  it("move para outra coluna na posição pedida, limitando o índice", () => {
    let data = withCards("A", "B", "C");
    data = moveCard(data, { cardId: "k1", toColumnId: "c-doing", toIndex: 0, now: LATER });
    data = moveCard(data, { cardId: "k2", toColumnId: "c-doing", toIndex: 99, now: LATER });
    expect(ids(cardsInColumn(data, "c-doing"))).toEqual(["k1", "k2"]);
    expect(ids(cardsInColumn(data, "c-todo"))).toEqual(["k3"]);
    expect(getCard(data, "k1").updatedAt).toBe(LATER);
  });

  it("preenche completedAt ao entrar em isDone e limpa ao sair", () => {
    let data = moveCard(withCards("A"), { cardId: "k1", toColumnId: "c-done", toIndex: 0, now: LATER });
    expect(getCard(data, "k1").completedAt).toBe(LATER);
    data = moveCard(data, { cardId: "k1", toColumnId: "c-todo", toIndex: 0, now: LATER });
    expect(getCard(data, "k1").completedAt).toBeUndefined();
  });

  it("rejeita coluna de outro quadro", () => {
    expect(() => moveCard(withCards("A"), { cardId: "k1", toColumnId: "nope", toIndex: 0, now: NOW })).toThrow(DomainError);
  });
});

describe("completeCard", () => {
  it("move para o fim da coluna isDone do quadro", () => {
    let data = addCard(withCards("A"), { id: "k9", boardId: "b1", columnId: "c-done", title: "Z", now: NOW });
    data = completeCard(data, "k1", LATER);
    expect(ids(cardsInColumn(data, "c-done"))).toEqual(["k9", "k1"]);
    expect(getCard(data, "k1").completedAt).toBe(LATER);
  });

  it("não altera cartão que já está concluído", () => {
    const data = addCard(base(), { id: "k1", boardId: "b1", columnId: "c-done", title: "Z", now: NOW });
    expect(completeCard(data, "k1", LATER)).toBe(data);
  });
});

describe("archiveCard / deleteCard / cardsInColumn", () => {
  it("arquivado some de cardsInColumn; excluído some dos dados", () => {
    let data = withCards("A", "B");
    data = archiveCard(data, "k1", LATER);
    expect(getCard(data, "k1")).toMatchObject({ archived: true, updatedAt: LATER });
    expect(ids(cardsInColumn(data, "c-todo"))).toEqual(["k2"]);
    data = deleteCard(data, "k2");
    expect(data.cards.map((c) => c.id)).toEqual(["k1"]);
    expect(() => deleteCard(data, "k2")).toThrow(DomainError);
  });
});

describe("checklistProgress", () => {
  it("conta itens feitos e total", () => {
    const data = updateCard(withCards("A"), "k1", {
      checklist: [
        { id: "i1", text: "um", done: true },
        { id: "i2", text: "dois", done: false },
      ],
    }, NOW);
    expect(checklistProgress(getCard(data, "k1"))).toEqual({ done: 1, total: 2 });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/domain/cards.test.ts`
Expected: FAIL, `Failed to resolve import "./cards"`

- [ ] **Step 3: Implementar**

`src/domain/cards.ts`:
```ts
import { getBoard, getColumn, getDoneColumn } from "./boards";
import { DomainError, requireText } from "./errors";
import { byOrder, nextOrder } from "./order";
import type { Card, KambanData } from "./schema";

export interface NewCardInput {
  id: string;
  boardId: string;
  columnId: string;
  title: string;
  now: string;
}

/** Chave presente com valor `undefined` limpa o campo. */
export type CardPatch = Partial<Pick<Card, "title" | "description" | "dueDate" | "priority" | "checklist">>;

export interface MoveCardInput {
  cardId: string;
  toColumnId: string;
  toIndex: number;
  now: string;
}

/** Ajusta completedAt conforme o cartão está ou não na coluna de concluídos. */
export function withCompletion(card: Card, inDoneColumn: boolean, now: string): Card {
  if (inDoneColumn && !card.completedAt) return { ...card, completedAt: now };
  if (!inDoneColumn && card.completedAt) return { ...card, completedAt: undefined };
  return card;
}

export function getCard(data: KambanData, cardId: string): Card {
  const card = data.cards.find((c) => c.id === cardId);
  if (!card) throw new DomainError(`Cartão não encontrado: ${cardId}`);
  return card;
}

function mapCard(data: KambanData, cardId: string, fn: (card: Card) => Card): KambanData {
  getCard(data, cardId);
  return { ...data, cards: data.cards.map((c) => (c.id === cardId ? fn(c) : c)) };
}

export function addCard(data: KambanData, input: NewCardInput): KambanData {
  const column = getColumn(getBoard(data, input.boardId), input.columnId);
  const card = withCompletion(
    {
      id: input.id,
      boardId: input.boardId,
      columnId: column.id,
      order: nextOrder(data.cards.filter((c) => c.columnId === column.id)),
      title: requireText(input.title, "Título"),
      checklist: [],
      archived: false,
      createdAt: input.now,
      updatedAt: input.now,
    },
    column.isDone,
    input.now,
  );
  return { ...data, cards: [...data.cards, card] };
}

export function updateCard(data: KambanData, cardId: string, patch: CardPatch, now: string): KambanData {
  const title = "title" in patch ? requireText(patch.title ?? "", "Título") : undefined;
  return mapCard(data, cardId, (c) => ({
    ...c,
    ...patch,
    ...(title !== undefined ? { title } : {}),
    updatedAt: now,
  }));
}

export function moveCard(data: KambanData, input: MoveCardInput): KambanData {
  const card = getCard(data, input.cardId);
  const target = getColumn(getBoard(data, card.boardId), input.toColumnId);
  const siblings = data.cards
    .filter((c) => c.columnId === target.id && !c.archived && c.id !== card.id)
    .sort(byOrder);
  const index = Math.max(0, Math.min(input.toIndex, siblings.length));
  const moved = withCompletion({ ...card, columnId: target.id, updatedAt: input.now }, target.isDone, input.now);
  const ordered = [...siblings.slice(0, index), moved, ...siblings.slice(index)];
  const byId = new Map(ordered.map((c, i) => [c.id, { ...c, order: i }]));
  return { ...data, cards: data.cards.map((c) => byId.get(c.id) ?? c) };
}

export function completeCard(data: KambanData, cardId: string, now: string): KambanData {
  const card = getCard(data, cardId);
  const done = getDoneColumn(getBoard(data, card.boardId));
  if (card.columnId === done.id) return data;
  return moveCard(data, { cardId, toColumnId: done.id, toIndex: Number.POSITIVE_INFINITY, now });
}

export function archiveCard(data: KambanData, cardId: string, now: string): KambanData {
  return mapCard(data, cardId, (c) => ({ ...c, archived: true, updatedAt: now }));
}

export function deleteCard(data: KambanData, cardId: string): KambanData {
  getCard(data, cardId);
  return { ...data, cards: data.cards.filter((c) => c.id !== cardId) };
}

export function cardsInColumn(data: KambanData, columnId: string): Card[] {
  return data.cards.filter((c) => c.columnId === columnId && !c.archived).sort(byOrder);
}

export function checklistProgress(card: Card): { done: number; total: number } {
  return { done: card.checklist.filter((i) => i.done).length, total: card.checklist.length };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test src/domain && pnpm typecheck && pnpm lint`
Expected: todos passam; sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/domain/cards.ts src/domain/cards.test.ts
git commit -m "feat(domain): criar, editar, mover, concluir e arquivar cartões"
```

---

### Task 5: Colunas

**Files:**
- Create: `src/domain/columns.ts`
- Test: `src/domain/columns.test.ts`

**Interfaces:**
- Consumes: `getBoard`, `getColumn`, `updateBoard`, `createInitialData` (Task 3); `addCard`, `getCard`, `cardsInColumn`, `withCompletion` (Task 4).
- Produces:
  - `addColumn(data, input: { boardId: string; id: string; name: string }): KambanData`
  - `renameColumn(data, boardId: string, columnId: string, name: string): KambanData`
  - `reorderColumns(data, boardId: string, orderedIds: readonly string[]): KambanData`
  - `setDoneColumn(data, boardId: string, columnId: string, now: string): KambanData`
  - `removeColumn(data, input: { boardId: string; columnId: string; moveCardsTo?: string; now: string }): KambanData`
  - `boardColumns(board: Board): Column[]` (por `order`)

- [ ] **Step 1: Escrever o teste que falha**

`src/domain/columns.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { createInitialData, getBoard } from "./boards";
import { addCard, cardsInColumn, getCard } from "./cards";
import { addColumn, boardColumns, removeColumn, renameColumn, reorderColumns, setDoneColumn } from "./columns";
import { DomainError } from "./errors";
import type { KambanData } from "./schema";
import { LATER, NOW } from "./testing";

function base(): KambanData {
  return createInitialData({ id: "b1", columnIds: ["c-todo", "c-doing", "c-done"] });
}

const names = (data: KambanData) => boardColumns(getBoard(data, "b1")).map((c) => c.name);

describe("addColumn / renameColumn / reorderColumns", () => {
  it("adiciona no fim, renomeia e reordena", () => {
    let data = addColumn(base(), { boardId: "b1", id: "c-wait", name: " Aguardando " });
    expect(names(data)).toEqual(["A fazer", "Fazendo", "Feito", "Aguardando"]);
    data = renameColumn(data, "b1", "c-wait", "Bloqueado");
    data = reorderColumns(data, "b1", ["c-todo", "c-wait", "c-doing", "c-done"]);
    expect(names(data)).toEqual(["A fazer", "Bloqueado", "Fazendo", "Feito"]);
  });

  it("rejeita nome vazio", () => {
    expect(() => addColumn(base(), { boardId: "b1", id: "x", name: "" })).toThrow(DomainError);
    expect(() => renameColumn(base(), "b1", "c-todo", " ")).toThrow(DomainError);
  });
});

describe("setDoneColumn", () => {
  it("troca a coluna isDone e ajusta completedAt dos cartões do quadro", () => {
    let data = addCard(base(), { id: "k1", boardId: "b1", columnId: "c-done", title: "Feito antes", now: NOW });
    data = addCard(data, { id: "k2", boardId: "b1", columnId: "c-doing", title: "Em andamento", now: NOW });
    data = setDoneColumn(data, "b1", "c-doing", LATER);

    const flags = boardColumns(getBoard(data, "b1")).map((c) => [c.id, c.isDone]);
    expect(flags).toEqual([["c-todo", false], ["c-doing", true], ["c-done", false]]);
    expect(getCard(data, "k1").completedAt).toBeUndefined();
    expect(getCard(data, "k2").completedAt).toBe(LATER);
  });
});

describe("removeColumn", () => {
  it("remove coluna vazia", () => {
    const data = removeColumn(base(), { boardId: "b1", columnId: "c-doing", now: NOW });
    expect(names(data)).toEqual(["A fazer", "Feito"]);
  });

  it("exige destino quando a coluna tem cartões", () => {
    const data = addCard(base(), { id: "k1", boardId: "b1", columnId: "c-doing", title: "X", now: NOW });
    expect(() => removeColumn(data, { boardId: "b1", columnId: "c-doing", now: NOW })).toThrow(DomainError);
    expect(() =>
      removeColumn(data, { boardId: "b1", columnId: "c-doing", moveCardsTo: "c-doing", now: NOW }),
    ).toThrow(DomainError);
  });

  it("move os cartões para o fim do destino, preservando a ordem, e ajusta completedAt", () => {
    let data = addCard(base(), { id: "k0", boardId: "b1", columnId: "c-done", title: "Z", now: NOW });
    data = addCard(data, { id: "k1", boardId: "b1", columnId: "c-doing", title: "A", now: NOW });
    data = addCard(data, { id: "k2", boardId: "b1", columnId: "c-doing", title: "B", now: NOW });
    data = removeColumn(data, { boardId: "b1", columnId: "c-doing", moveCardsTo: "c-done", now: LATER });

    expect(cardsInColumn(data, "c-done").map((c) => c.id)).toEqual(["k0", "k1", "k2"]);
    expect(getCard(data, "k1")).toMatchObject({ completedAt: LATER, updatedAt: LATER });
  });

  it("não permite remover a coluna isDone", () => {
    expect(() => removeColumn(base(), { boardId: "b1", columnId: "c-done", now: NOW })).toThrow(DomainError);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/domain/columns.test.ts`
Expected: FAIL, `Failed to resolve import "./columns"`

- [ ] **Step 3: Implementar**

`src/domain/columns.ts`:
```ts
import { getBoard, getColumn, updateBoard } from "./boards";
import { withCompletion } from "./cards";
import { DomainError, requireText } from "./errors";
import { applyOrder, byOrder, nextOrder } from "./order";
import type { Board, Column, KambanData } from "./schema";

export function boardColumns(board: Board): Column[] {
  return [...board.columns].sort(byOrder);
}

export function addColumn(data: KambanData, input: { boardId: string; id: string; name: string }): KambanData {
  const name = requireText(input.name, "Nome da coluna");
  return updateBoard(data, input.boardId, (b) => ({
    ...b,
    columns: [...b.columns, { id: input.id, name, order: nextOrder(b.columns), isDone: false }],
  }));
}

export function renameColumn(data: KambanData, boardId: string, columnId: string, name: string): KambanData {
  const trimmed = requireText(name, "Nome da coluna");
  getColumn(getBoard(data, boardId), columnId);
  return updateBoard(data, boardId, (b) => ({
    ...b,
    columns: b.columns.map((c) => (c.id === columnId ? { ...c, name: trimmed } : c)),
  }));
}

export function reorderColumns(data: KambanData, boardId: string, orderedIds: readonly string[]): KambanData {
  return updateBoard(data, boardId, (b) => ({ ...b, columns: applyOrder(b.columns, orderedIds) }));
}

export function setDoneColumn(data: KambanData, boardId: string, columnId: string, now: string): KambanData {
  getColumn(getBoard(data, boardId), columnId);
  const next = updateBoard(data, boardId, (b) => ({
    ...b,
    columns: b.columns.map((c) => ({ ...c, isDone: c.id === columnId })),
  }));
  return {
    ...next,
    cards: next.cards.map((card) =>
      card.boardId === boardId ? withCompletion(card, card.columnId === columnId, now) : card,
    ),
  };
}

export function removeColumn(
  data: KambanData,
  input: { boardId: string; columnId: string; moveCardsTo?: string; now: string },
): KambanData {
  const board = getBoard(data, input.boardId);
  const column = getColumn(board, input.columnId);
  if (column.isDone) {
    throw new DomainError("A coluna de concluídos não pode ser removida. Marque outra coluna como concluída antes.");
  }

  let cards = data.cards;
  const affected = data.cards.filter((c) => c.columnId === column.id).sort(byOrder);
  if (affected.length > 0) {
    if (!input.moveCardsTo || input.moveCardsTo === column.id) {
      throw new DomainError("Escolha outra coluna para receber os cartões desta coluna.");
    }
    const target = getColumn(board, input.moveCardsTo);
    let order = nextOrder(data.cards.filter((c) => c.columnId === target.id));
    const moved = new Map(
      affected.map((c) => [
        c.id,
        withCompletion({ ...c, columnId: target.id, order: order++, updatedAt: input.now }, target.isDone, input.now),
      ]),
    );
    cards = data.cards.map((c) => moved.get(c.id) ?? c);
  }

  return updateBoard({ ...data, cards }, input.boardId, (b) => ({
    ...b,
    columns: b.columns.filter((c) => c.id !== column.id),
  }));
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test src/domain && pnpm typecheck && pnpm lint`
Expected: todos passam; sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/domain/columns.ts src/domain/columns.test.ts
git commit -m "feat(domain): colunas personalizáveis e coluna de concluídos"
```

---

### Task 6: Hábitos

**Files:**
- Create: `src/domain/habits.ts`
- Test: `src/domain/habits.test.ts`

**Interfaces:**
- Consumes: `weekdayOf` (Task 1); `createEmptyData` (Task 3); `DomainError`, `requireText`, `nextOrder`, `byOrder`, `applyOrder`; `makeHabit`, `NOW` (Task 2).
- Produces:
  - `isHabitDueOn(habit: Habit, date: string): boolean`
  - `addHabit(data, input: { id: string; title: string; schedule: HabitSchedule; now: string }): KambanData`
  - `updateHabit(data, habitId: string, patch: { title?: string; schedule?: HabitSchedule }): KambanData`
  - `archiveHabit(data, habitId: string): KambanData`
  - `reorderHabits(data, orderedIds: readonly string[]): KambanData`
  - `activeHabits(data): Habit[]` (não arquivados, por `order`)
  - `getHabit(data, habitId: string): Habit`
  - `isHabitDone(data, habitId: string, date: string): boolean`
  - `toggleHabit(data, habitId: string, date: string): KambanData`

- [ ] **Step 1: Escrever o teste que falha**

`src/domain/habits.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { createEmptyData } from "./boards";
import { DomainError } from "./errors";
import {
  activeHabits,
  addHabit,
  archiveHabit,
  getHabit,
  isHabitDone,
  isHabitDueOn,
  reorderHabits,
  toggleHabit,
  updateHabit,
} from "./habits";
import type { HabitSchedule } from "./schema";
import { makeHabit, NOW } from "./testing";

// Semana de 20/09/2026 (domingo) a 26/09/2026 (sábado)
const WEEK = ["2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26"];
const dueDays = (schedule: HabitSchedule) =>
  WEEK.map((d) => isHabitDueOn(makeHabit({ id: "h", schedule }), d));

describe("isHabitDueOn", () => {
  it("daily: todos os dias", () => {
    expect(dueDays({ type: "daily" })).toEqual([true, true, true, true, true, true, true]);
  });

  it("weekdays: segunda a sexta", () => {
    expect(dueDays({ type: "weekdays" })).toEqual([false, true, true, true, true, true, false]);
  });

  it("custom: só os dias escolhidos (seg, qua, sex)", () => {
    expect(dueDays({ type: "custom", days: [1, 3, 5] })).toEqual([false, true, false, true, false, true, false]);
  });
});

describe("addHabit / updateHabit / archiveHabit / reorderHabits", () => {
  it("cria, edita, reordena e arquiva", () => {
    let data = addHabit(createEmptyData(), { id: "h1", title: " Academia ", schedule: { type: "weekdays" }, now: NOW });
    data = addHabit(data, { id: "h2", title: "Ler", schedule: { type: "custom", days: [5, 1, 1] }, now: NOW });
    expect(getHabit(data, "h1")).toMatchObject({ title: "Academia", order: 0, archived: false, createdAt: NOW });
    expect(getHabit(data, "h2").schedule).toEqual({ type: "custom", days: [1, 5] });

    data = updateHabit(data, "h1", { title: "Treino", schedule: { type: "daily" } });
    data = reorderHabits(data, ["h2", "h1"]);
    expect(activeHabits(data).map((h) => h.title)).toEqual(["Ler", "Treino"]);

    data = archiveHabit(data, "h2");
    expect(activeHabits(data).map((h) => h.id)).toEqual(["h1"]);
  });

  it("rejeita título vazio, custom sem dias e hábito inexistente", () => {
    const data = createEmptyData();
    expect(() => addHabit(data, { id: "h1", title: "", schedule: { type: "daily" }, now: NOW })).toThrow(DomainError);
    expect(() => addHabit(data, { id: "h1", title: "X", schedule: { type: "custom", days: [] }, now: NOW })).toThrow(DomainError);
    expect(() => updateHabit(data, "nope", { title: "X" })).toThrow(DomainError);
  });
});

describe("toggleHabit / isHabitDone", () => {
  it("marca e desmarca por dia, sem duplicar registro", () => {
    let data = addHabit(createEmptyData(), { id: "h1", title: "Água", schedule: { type: "daily" }, now: NOW });
    data = toggleHabit(data, "h1", "2026-09-23");
    expect(isHabitDone(data, "h1", "2026-09-23")).toBe(true);
    expect(isHabitDone(data, "h1", "2026-09-24")).toBe(false);
    expect(data.habitLog).toEqual([{ habitId: "h1", date: "2026-09-23" }]);

    data = toggleHabit(data, "h1", "2026-09-23");
    expect(isHabitDone(data, "h1", "2026-09-23")).toBe(false);
    expect(data.habitLog).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/domain/habits.test.ts`
Expected: FAIL, `Failed to resolve import "./habits"`

- [ ] **Step 3: Implementar**

`src/domain/habits.ts`:
```ts
import { weekdayOf } from "./dates";
import { DomainError, requireText } from "./errors";
import { applyOrder, byOrder, nextOrder } from "./order";
import type { Habit, HabitSchedule, KambanData } from "./schema";

export function isHabitDueOn(habit: Habit, date: string): boolean {
  const day = weekdayOf(date);
  switch (habit.schedule.type) {
    case "daily":
      return true;
    case "weekdays":
      return day >= 1 && day <= 5;
    case "custom":
      return habit.schedule.days.includes(day);
  }
}

function normalizeSchedule(schedule: HabitSchedule): HabitSchedule {
  if (schedule.type !== "custom") return schedule;
  const days = [...new Set(schedule.days)].sort((a, b) => a - b);
  if (days.length === 0) throw new DomainError("Escolha ao menos um dia da semana para o hábito.");
  if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    throw new DomainError("Dia da semana inválido.");
  }
  return { type: "custom", days };
}

export function getHabit(data: KambanData, habitId: string): Habit {
  const habit = data.habits.find((h) => h.id === habitId);
  if (!habit) throw new DomainError(`Hábito não encontrado: ${habitId}`);
  return habit;
}

function mapHabit(data: KambanData, habitId: string, fn: (habit: Habit) => Habit): KambanData {
  getHabit(data, habitId);
  return { ...data, habits: data.habits.map((h) => (h.id === habitId ? fn(h) : h)) };
}

export function addHabit(
  data: KambanData,
  input: { id: string; title: string; schedule: HabitSchedule; now: string },
): KambanData {
  const habit: Habit = {
    id: input.id,
    title: requireText(input.title, "Nome do hábito"),
    order: nextOrder(data.habits),
    archived: false,
    schedule: normalizeSchedule(input.schedule),
    createdAt: input.now,
  };
  return { ...data, habits: [...data.habits, habit] };
}

export function updateHabit(
  data: KambanData,
  habitId: string,
  patch: { title?: string; schedule?: HabitSchedule },
): KambanData {
  const title = patch.title !== undefined ? requireText(patch.title, "Nome do hábito") : undefined;
  const schedule = patch.schedule !== undefined ? normalizeSchedule(patch.schedule) : undefined;
  return mapHabit(data, habitId, (h) => ({
    ...h,
    ...(title !== undefined ? { title } : {}),
    ...(schedule !== undefined ? { schedule } : {}),
  }));
}

export function archiveHabit(data: KambanData, habitId: string): KambanData {
  return mapHabit(data, habitId, (h) => ({ ...h, archived: true }));
}

export function reorderHabits(data: KambanData, orderedIds: readonly string[]): KambanData {
  return { ...data, habits: applyOrder(data.habits, orderedIds) };
}

export function activeHabits(data: KambanData): Habit[] {
  return data.habits.filter((h) => !h.archived).sort(byOrder);
}

export function isHabitDone(data: KambanData, habitId: string, date: string): boolean {
  return data.habitLog.some((e) => e.habitId === habitId && e.date === date);
}

export function toggleHabit(data: KambanData, habitId: string, date: string): KambanData {
  getHabit(data, habitId);
  const habitLog = isHabitDone(data, habitId, date)
    ? data.habitLog.filter((e) => !(e.habitId === habitId && e.date === date))
    : [...data.habitLog, { habitId, date }];
  return { ...data, habitLog };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test src/domain && pnpm typecheck && pnpm lint`
Expected: todos passam; sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/domain/habits.ts src/domain/habits.test.ts
git commit -m "feat(domain): hábitos com programação semanal e registro diário"
```

---

### Task 7: Tela Hoje (consulta)

**Files:**
- Create: `src/domain/today.ts`
- Test: `src/domain/today.test.ts`

**Interfaces:**
- Consumes: `activeBoards`, `addBoard`, `archiveBoard`, `createInitialData` (Task 3); `addCard`, `updateCard`, `archiveCard`, `completeCard` (Task 4); `activeHabits`, `addHabit`, `isHabitDueOn`, `isHabitDone`, `toggleHabit` (Task 6).
- Produces:
  - `interface TodayCard { card: Card; boardName: string }`
  - `interface TodayHabit { habit: Habit; done: boolean }`
  - `interface TodayView { habits: TodayHabit[]; habitsDone: number; overdue: TodayCard[]; dueToday: TodayCard[] }`
  - `buildToday(data: KambanData, today: string): TodayView`

- [ ] **Step 1: Escrever o teste que falha**

`src/domain/today.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { addBoard, archiveBoard, createInitialData } from "./boards";
import { addCard, archiveCard, completeCard, updateCard, type CardPatch } from "./cards";
import { addHabit, toggleHabit } from "./habits";
import type { KambanData } from "./schema";
import { NOW } from "./testing";
import { buildToday } from "./today";

const TODAY = "2026-09-23"; // quarta-feira

function card(data: KambanData, id: string, boardId: string, columnId: string, patch: CardPatch): KambanData {
  return updateCard(addCard(data, { id, boardId, columnId, title: id, now: NOW }), id, patch, NOW);
}

function fixture(): KambanData {
  let data = createInitialData({ id: "b1", columnIds: ["c-todo", "c-doing", "c-done"] });
  data = addBoard(data, { id: "b2", name: "Casa", columnIds: ["d-todo", "d-doing", "d-done"] });
  data = addBoard(data, { id: "b3", name: "Antigo", columnIds: ["e-todo", "e-doing", "e-done"] });

  data = card(data, "late-2", "b1", "c-todo", { dueDate: "2026-09-22" });
  data = card(data, "late-1", "b2", "d-doing", { dueDate: "2026-09-20" });
  data = card(data, "today-low", "b1", "c-todo", { dueDate: TODAY, priority: "low" });
  data = card(data, "today-none", "b1", "c-todo", { dueDate: TODAY });
  data = card(data, "today-high", "b2", "d-todo", { dueDate: TODAY, priority: "high" });
  data = card(data, "future", "b1", "c-todo", { dueDate: "2026-09-24" });
  data = card(data, "no-date", "b1", "c-todo", {});
  data = card(data, "done", "b1", "c-todo", { dueDate: "2026-09-21" });
  data = completeCard(data, "done", NOW);
  data = card(data, "archived", "b1", "c-todo", { dueDate: TODAY });
  data = archiveCard(data, "archived", NOW);
  data = card(data, "archived-board", "b3", "e-todo", { dueDate: TODAY });
  data = archiveBoard(data, "b3");

  data = addHabit(data, { id: "h-daily", title: "Água", schedule: { type: "daily" }, now: NOW });
  data = addHabit(data, { id: "h-wed", title: "Ler", schedule: { type: "custom", days: [3] }, now: NOW });
  data = addHabit(data, { id: "h-sat", title: "Faxina", schedule: { type: "custom", days: [6] }, now: NOW });
  data = toggleHabit(data, "h-wed", TODAY);
  return data;
}

describe("buildToday", () => {
  const view = buildToday(fixture(), TODAY);

  it("lista atrasados do mais antigo para o mais recente, com nome do quadro", () => {
    expect(view.overdue.map((x) => [x.card.id, x.boardName])).toEqual([
      ["late-1", "Casa"],
      ["late-2", "To-do"],
    ]);
  });

  it("lista os de hoje por prioridade: alta, média, baixa, sem prioridade", () => {
    expect(view.dueToday.map((x) => x.card.id)).toEqual(["today-high", "today-low", "today-none"]);
  });

  it("ignora concluídos, arquivados, sem data, futuros e cartões de quadro arquivado", () => {
    const all = [...view.overdue, ...view.dueToday].map((x) => x.card.id);
    for (const id of ["done", "archived", "no-date", "future", "archived-board"]) {
      expect(all).not.toContain(id);
    }
  });

  it("lista só os hábitos devidos hoje, com status e contador", () => {
    expect(view.habits.map((h) => [h.habit.id, h.done])).toEqual([
      ["h-daily", false],
      ["h-wed", true],
    ]);
    expect(view.habitsDone).toBe(1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/domain/today.test.ts`
Expected: FAIL, `Failed to resolve import "./today"`

- [ ] **Step 3: Implementar**

`src/domain/today.ts`:
```ts
import { activeBoards } from "./boards";
import { activeHabits, isHabitDone, isHabitDueOn } from "./habits";
import type { Card, Habit, KambanData, Priority } from "./schema";

export interface TodayCard {
  card: Card;
  boardName: string;
}

export interface TodayHabit {
  habit: Habit;
  done: boolean;
}

export interface TodayView {
  habits: TodayHabit[];
  habitsDone: number;
  overdue: TodayCard[];
  dueToday: TodayCard[];
}

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
const NO_PRIORITY_RANK = 3;

function priorityRank(card: Card): number {
  return card.priority ? PRIORITY_RANK[card.priority] : NO_PRIORITY_RANK;
}

/** Cartões abertos (fora da coluna de concluídos, não arquivados, de quadros ativos) com prazo. */
function openCardsWithDueDate(data: KambanData): TodayCard[] {
  const result: TodayCard[] = [];
  for (const board of activeBoards(data)) {
    const doneColumnId = board.columns.find((c) => c.isDone)?.id;
    for (const card of data.cards) {
      if (card.boardId === board.id && !card.archived && card.columnId !== doneColumnId && card.dueDate) {
        result.push({ card, boardName: board.name });
      }
    }
  }
  return result;
}

export function buildToday(data: KambanData, today: string): TodayView {
  const habits = activeHabits(data)
    .filter((habit) => isHabitDueOn(habit, today))
    .map((habit) => ({ habit, done: isHabitDone(data, habit.id, today) }));

  const open = openCardsWithDueDate(data);
  const dueDate = (x: TodayCard) => x.card.dueDate ?? "";

  const overdue = open.filter((x) => dueDate(x) < today).sort((a, b) => dueDate(a).localeCompare(dueDate(b)));
  const dueToday = open.filter((x) => dueDate(x) === today).sort((a, b) => priorityRank(a.card) - priorityRank(b.card));

  return { habits, habitsDone: habits.filter((h) => h.done).length, overdue, dueToday };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test src/domain && pnpm typecheck && pnpm lint`
Expected: todos passam; sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/domain/today.ts src/domain/today.test.ts
git commit -m "feat(domain): consulta da tela Hoje"
```

---

### Task 8: FileSystem, MemoryFs e leitura com validação e migração

**Files:**
- Create: `src/persistence/fs.ts`, `src/persistence/memoryFs.ts`, `src/persistence/load.ts`
- Test: `src/persistence/memoryFs.test.ts`, `src/persistence/load.test.ts`

**Interfaces:**
- Consumes: `kambanDataSchema`, `CURRENT_VERSION`, `KambanData` (Task 2); `createInitialData` (Task 3).
- Produces:
  - `interface FileSystem { readText(path): Promise<string>; writeText(path, content): Promise<void>; rename(from, to): Promise<void>; exists(path): Promise<boolean>; mkdir(path): Promise<void>; list(dir): Promise<string[]>; remove(path): Promise<void>; mtime(path): Promise<number> }`
  - Constantes `DATA_FILE = "kamban.json"`, `TMP_FILE = "kamban.json.tmp"`, `BACKUP_DIR = "backups"`; `joinPath(...parts: string[]): string`
  - `class MemoryFs implements FileSystem` com `files: Map<string, { content: string; mtime: number }>`, `dirs: Set<string>`, `failWrites: boolean`
  - `type LoadError = "invalid-json" | "invalid-schema" | "future-version"`
  - `type ParseResult = { ok: true; data: KambanData } | { ok: false; error: LoadError; message: string }`
  - `type Migration = (raw: Record<string, unknown>) => Record<string, unknown>`; `MIGRATIONS: Record<number, Migration>` (chave = versão de origem; vazio na v1)
  - `migrate(raw: unknown, migrations?: Record<number, Migration>, current?: number): unknown`
  - `parseData(text: string): ParseResult`
  - `type LoadOutcome = { status: "no-folder" } | { status: "missing" } | { status: "ok"; data: KambanData; mtime: number } | { status: "error"; error: LoadError; message: string }`
  - `loadData(fs: FileSystem, dir: string): Promise<LoadOutcome>`

- [ ] **Step 1: Escrever os testes que falham**

`src/persistence/memoryFs.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { joinPath } from "./fs";
import { MemoryFs } from "./memoryFs";

describe("joinPath", () => {
  it("junta partes sem barras duplicadas", () => {
    expect(joinPath("/data/", "backups", "a.json")).toBe("/data/backups/a.json");
  });
});

describe("MemoryFs", () => {
  it("lê, grava, renomeia, lista, remove e informa mtime crescente", async () => {
    const fs = new MemoryFs();
    await fs.mkdir("/d");
    await fs.writeText("/d/a.txt", "1");
    const first = await fs.mtime("/d/a.txt");
    await fs.rename("/d/a.txt", "/d/b.txt");
    expect(await fs.exists("/d/a.txt")).toBe(false);
    expect(await fs.readText("/d/b.txt")).toBe("1");
    expect(await fs.mtime("/d/b.txt")).toBeGreaterThan(first);
    await fs.writeText("/d/sub/c.txt", "2");
    expect(await fs.list("/d")).toEqual(["b.txt"]);
    await fs.remove("/d/b.txt");
    expect(await fs.exists("/d/b.txt")).toBe(false);
    expect(await fs.exists("/d")).toBe(true);
  });

  it("falha leitura de arquivo inexistente e gravação quando failWrites", async () => {
    const fs = new MemoryFs();
    await expect(fs.readText("/x")).rejects.toThrow("ENOENT");
    fs.failWrites = true;
    await expect(fs.writeText("/x", "1")).rejects.toThrow("EIO");
  });
});
```

`src/persistence/load.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { createInitialData } from "../domain/boards";
import { loadData, migrate, parseData } from "./load";
import { MemoryFs } from "./memoryFs";

const initial = () => createInitialData({ id: "b1", columnIds: ["c1", "c2", "c3"] });

describe("parseData", () => {
  it("aceita JSON válido", () => {
    const result = parseData(JSON.stringify(initial()));
    expect(result).toEqual({ ok: true, data: initial() });
  });

  it("identifica JSON quebrado", () => {
    expect(parseData("{ nope")).toMatchObject({ ok: false, error: "invalid-json" });
  });

  it("identifica schema inválido com mensagem", () => {
    const result = parseData(JSON.stringify({ ...initial(), boards: "x" }));
    expect(result).toMatchObject({ ok: false, error: "invalid-schema" });
    if (!result.ok) expect(result.message).not.toBe("");
  });

  it("recusa versão mais nova que a suportada", () => {
    expect(parseData(JSON.stringify({ ...initial(), version: 99 }))).toMatchObject({
      ok: false,
      error: "future-version",
    });
  });
});

describe("migrate", () => {
  it("aplica as migrações em sequência até a versão atual", () => {
    const migrations = {
      1: (raw: Record<string, unknown>) => ({ ...raw, version: 2, a: true }),
      2: (raw: Record<string, unknown>) => ({ ...raw, version: 3, b: true }),
    };
    expect(migrate({ version: 1 }, migrations, 3)).toEqual({ version: 3, a: true, b: true });
  });

  it("devolve o valor como está quando não há versão numérica", () => {
    expect(migrate("x")).toBe("x");
    expect(migrate({ a: 1 })).toEqual({ a: 1 });
  });
});

describe("loadData", () => {
  it("retorna no-folder, missing, ok e error conforme o estado da pasta", async () => {
    const fs = new MemoryFs();
    expect(await loadData(fs, "/d")).toEqual({ status: "no-folder" });

    await fs.mkdir("/d");
    expect(await loadData(fs, "/d")).toEqual({ status: "missing" });

    await fs.writeText("/d/kamban.json", JSON.stringify(initial()));
    const ok = await loadData(fs, "/d");
    expect(ok).toEqual({ status: "ok", data: initial(), mtime: await fs.mtime("/d/kamban.json") });

    await fs.writeText("/d/kamban.json", "{");
    expect(await loadData(fs, "/d")).toMatchObject({ status: "error", error: "invalid-json" });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/persistence`
Expected: FAIL, imports `./fs`, `./memoryFs`, `./load` não resolvidos.

- [ ] **Step 3: Implementar**

`src/persistence/fs.ts`:
```ts
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
```

`src/persistence/memoryFs.ts`:
```ts
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
```

`src/persistence/load.ts`:
```ts
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test src/persistence && pnpm typecheck && pnpm lint`
Expected: todos passam; sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/persistence
git commit -m "feat(persistence): FileSystem, MemoryFs e leitura com validação e migração"
```

---

### Task 9: Gravação atômica, backups e restauração

**Files:**
- Create: `src/persistence/backups.ts`, `src/persistence/save.ts`, `src/persistence/restore.ts`
- Test: `src/persistence/save.test.ts`, `src/persistence/restore.test.ts`

**Interfaces:**
- Consumes: `FileSystem`, `DATA_FILE`, `TMP_FILE`, `BACKUP_DIR`, `joinPath`, `MemoryFs` (Task 8); `parseData`, `LoadOutcome` (Task 8); `KambanData`, `createInitialData`, `renameBoard`.
- Produces:
  - `BACKUPS_TO_KEEP = 14`; `backupName(date: string): string` (`kamban-YYYY-MM-DD.json`)
  - `listBackups(fs, dir): Promise<string[]>` (nomes, mais recente primeiro)
  - `rotateBackups(fs, dir, keep?: number): Promise<void>`
  - `backupIfNeeded(fs, dir, today: string): Promise<void>`
  - `serialize(data: KambanData): string`
  - `writeAtomic(fs, dir, content: string): Promise<number>` (retorna mtime)
  - `saveData(fs, dir, data: KambanData, today: string): Promise<number>` (retorna mtime)
  - `type RestoreOutcome = { status: "ok"; data: KambanData; mtime: number; backup: string } | { status: "no-backup" }`
  - `restoreLatestBackup(fs, dir): Promise<RestoreOutcome>`

- [ ] **Step 1: Escrever os testes que falham**

`src/persistence/save.test.ts`:
```ts
import { beforeEach, describe, expect, it } from "vitest";
import { createInitialData, renameBoard } from "../domain/boards";
import { backupName, listBackups, rotateBackups } from "./backups";
import { MemoryFs } from "./memoryFs";
import { saveData, serialize } from "./save";

const DIR = "/data";
const initial = () => createInitialData({ id: "b1", columnIds: ["c1", "c2", "c3"] });

let fs: MemoryFs;
beforeEach(async () => {
  fs = new MemoryFs();
  await fs.mkdir(DIR);
});

describe("saveData", () => {
  it("grava via arquivo temporário e não deixa o .tmp para trás", async () => {
    const mtime = await saveData(fs, DIR, initial(), "2026-09-23");
    expect(await fs.readText("/data/kamban.json")).toBe(serialize(initial()));
    expect(await fs.exists("/data/kamban.json.tmp")).toBe(false);
    expect(mtime).toBe(await fs.mtime("/data/kamban.json"));
  });

  it("mantém o arquivo anterior intacto se a gravação falhar", async () => {
    await saveData(fs, DIR, initial(), "2026-09-23");
    fs.failWrites = true;
    await expect(saveData(fs, DIR, renameBoard(initial(), "b1", "Outro"), "2026-09-23")).rejects.toThrow();
    expect(await fs.readText("/data/kamban.json")).toBe(serialize(initial()));
  });

  it("na primeira gravação do dia copia o arquivo atual para backups, só uma vez por dia", async () => {
    await saveData(fs, DIR, initial(), "2026-09-23"); // não havia arquivo: sem backup
    expect(await listBackups(fs, DIR)).toEqual([]);

    const v2 = renameBoard(initial(), "b1", "V2");
    await saveData(fs, DIR, v2, "2026-09-23");
    expect(await listBackups(fs, DIR)).toEqual(["kamban-2026-09-23.json"]);
    expect(await fs.readText("/data/backups/kamban-2026-09-23.json")).toBe(serialize(initial()));

    await saveData(fs, DIR, renameBoard(initial(), "b1", "V3"), "2026-09-23");
    expect(await fs.readText("/data/backups/kamban-2026-09-23.json")).toBe(serialize(initial()));

    await saveData(fs, DIR, initial(), "2026-09-24");
    expect(await listBackups(fs, DIR)).toEqual(["kamban-2026-09-24.json", "kamban-2026-09-23.json"]);
  });
});

describe("rotateBackups", () => {
  it("mantém só os 14 mais recentes e ignora arquivos com outro nome", async () => {
    for (let day = 1; day <= 16; day++) {
      await fs.writeText(`/data/backups/${backupName(`2026-09-${String(day).padStart(2, "0")}`)}`, "{}");
    }
    await fs.writeText("/data/backups/notas.txt", "x");
    await fs.mkdir("/data/backups");
    await rotateBackups(fs, DIR);

    const names = await listBackups(fs, DIR);
    expect(names).toHaveLength(14);
    expect(names[0]).toBe("kamban-2026-09-16.json");
    expect(names.at(-1)).toBe("kamban-2026-09-03.json");
    expect(await fs.exists("/data/backups/notas.txt")).toBe(true);
  });
});
```

`src/persistence/restore.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { createInitialData } from "../domain/boards";
import { MemoryFs } from "./memoryFs";
import { restoreLatestBackup } from "./restore";
import { serialize } from "./save";

const initial = () => createInitialData({ id: "b1", columnIds: ["c1", "c2", "c3"] });

describe("restoreLatestBackup", () => {
  it("restaura o backup válido mais recente sem gerar novo backup", async () => {
    const fs = new MemoryFs();
    await fs.mkdir("/data");
    await fs.mkdir("/data/backups");
    await fs.writeText("/data/kamban.json", "{ corrompido");
    await fs.writeText("/data/backups/kamban-2026-09-22.json", serialize(initial()));
    await fs.writeText("/data/backups/kamban-2026-09-23.json", "{ também corrompido");

    const outcome = await restoreLatestBackup(fs, "/data");

    expect(outcome).toMatchObject({ status: "ok", data: initial(), backup: "kamban-2026-09-22.json" });
    expect(await fs.readText("/data/kamban.json")).toBe(serialize(initial()));
    expect((await fs.list("/data/backups")).sort()).toEqual(["kamban-2026-09-22.json", "kamban-2026-09-23.json"]);
  });

  it("retorna no-backup quando não há backup válido", async () => {
    const fs = new MemoryFs();
    await fs.mkdir("/data");
    expect(await restoreLatestBackup(fs, "/data")).toEqual({ status: "no-backup" });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/persistence/save.test.ts src/persistence/restore.test.ts`
Expected: FAIL, imports `./backups`, `./save`, `./restore` não resolvidos.

- [ ] **Step 3: Implementar**

`src/persistence/backups.ts`:
```ts
import { BACKUP_DIR, DATA_FILE, joinPath, type FileSystem } from "./fs";

export const BACKUPS_TO_KEEP = 14;
const BACKUP_PATTERN = /^kamban-\d{4}-\d{2}-\d{2}\.json$/;

export function backupName(date: string): string {
  return `kamban-${date}.json`;
}

/** Nomes dos backups, do mais recente para o mais antigo. */
export async function listBackups(fs: FileSystem, dir: string): Promise<string[]> {
  const backupDir = joinPath(dir, BACKUP_DIR);
  if (!(await fs.exists(backupDir))) return [];
  return (await fs.list(backupDir))
    .filter((name) => BACKUP_PATTERN.test(name))
    .sort()
    .reverse();
}

export async function rotateBackups(fs: FileSystem, dir: string, keep: number = BACKUPS_TO_KEEP): Promise<void> {
  for (const name of (await listBackups(fs, dir)).slice(keep)) {
    await fs.remove(joinPath(dir, BACKUP_DIR, name));
  }
}

/** Copia o arquivo de dados atual para o backup do dia, se ainda não existir. */
export async function backupIfNeeded(fs: FileSystem, dir: string, today: string): Promise<void> {
  const source = joinPath(dir, DATA_FILE);
  if (!(await fs.exists(source))) return;
  const backupDir = joinPath(dir, BACKUP_DIR);
  const target = joinPath(backupDir, backupName(today));
  if (await fs.exists(target)) return;
  await fs.mkdir(backupDir);
  await fs.writeText(target, await fs.readText(source));
  await rotateBackups(fs, dir);
}
```

`src/persistence/save.ts`:
```ts
import type { KambanData } from "../domain/schema";
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
  await backupIfNeeded(fs, dir, today);
  return writeAtomic(fs, dir, serialize(data));
}
```

`src/persistence/restore.ts`:
```ts
import type { KambanData } from "../domain/schema";
import { listBackups } from "./backups";
import { BACKUP_DIR, joinPath, type FileSystem } from "./fs";
import { parseData } from "./load";
import { serialize, writeAtomic } from "./save";

export type RestoreOutcome =
  | { status: "ok"; data: KambanData; mtime: number; backup: string }
  | { status: "no-backup" };

/**
 * Restaura o backup válido mais recente por cima do arquivo de dados.
 * Não passa por saveData, para não transformar o arquivo corrompido em backup.
 */
export async function restoreLatestBackup(fs: FileSystem, dir: string): Promise<RestoreOutcome> {
  for (const name of await listBackups(fs, dir)) {
    const result = parseData(await fs.readText(joinPath(dir, BACKUP_DIR, name)));
    if (result.ok) {
      const mtime = await writeAtomic(fs, dir, serialize(result.data));
      return { status: "ok", data: result.data, mtime, backup: name };
    }
  }
  return { status: "no-backup" };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test src/persistence && pnpm typecheck && pnpm lint`
Expected: todos passam; sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/persistence
git commit -m "feat(persistence): gravação atômica, backups diários e restauração"
```

---

### Task 10: Agendador de gravação (debounce, flush e nova tentativa)

**Files:**
- Create: `src/persistence/saveScheduler.ts`
- Test: `src/persistence/saveScheduler.test.ts`

**Interfaces:**
- Consumes: nada de tarefas anteriores (recebe a função de gravação por parâmetro).
- Produces:
  - `type SaveStatus = "saved" | "pending" | "saving" | "error"`
  - `interface SaveSchedulerOptions { save: () => Promise<void>; onStatus?: (status: SaveStatus) => void; debounceMs?: number; retryMs?: number }` (padrões 500 e 5000)
  - `interface SaveScheduler { schedule(): void; flush(): Promise<void>; hasPendingChanges(): boolean; dispose(): void }`
  - `createSaveScheduler(options: SaveSchedulerOptions): SaveScheduler`
  - A Fase 2 usa: `schedule()` a cada mudança no store, `flush()` ao fechar a janela e ao ganhar foco com status `"error"`, `hasPendingChanges()` na detecção de alteração externa.

- [ ] **Step 1: Escrever o teste que falha**

`src/persistence/saveScheduler.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSaveScheduler, type SaveStatus } from "./saveScheduler";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function setup(save: () => Promise<void> = async () => {}) {
  const statuses: SaveStatus[] = [];
  const saveFn = vi.fn(save);
  const scheduler = createSaveScheduler({ save: saveFn, onStatus: (s) => statuses.push(s) });
  return { scheduler, saveFn, statuses };
}

describe("createSaveScheduler", () => {
  it("agrupa mudanças próximas numa única gravação após 500 ms", async () => {
    const { scheduler, saveFn, statuses } = setup();
    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(300);
    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(499);
    expect(saveFn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(statuses.at(-1)).toBe("saved");
    expect(scheduler.hasPendingChanges()).toBe(false);
  });

  it("flush grava na hora e não grava de novo depois", async () => {
    const { scheduler, saveFn } = setup();
    scheduler.schedule();
    await scheduler.flush();
    expect(saveFn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(saveFn).toHaveBeenCalledTimes(1);
  });

  it("flush sem mudanças pendentes não grava", async () => {
    const { scheduler, saveFn } = setup();
    await scheduler.flush();
    expect(saveFn).not.toHaveBeenCalled();
  });

  it("mudança durante a gravação gera nova gravação depois", async () => {
    let release: () => void = () => {};
    const { scheduler, saveFn } = setup(
      () => new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(500);
    expect(saveFn).toHaveBeenCalledTimes(1);

    scheduler.schedule();
    const flushed = scheduler.flush();
    release();
    await vi.advanceTimersByTimeAsync(0);
    release();
    await flushed;
    expect(saveFn).toHaveBeenCalledTimes(2);
    expect(scheduler.hasPendingChanges()).toBe(false);
  });

  it("após falha fica em error, mantém pendência e tenta de novo em 5 s", async () => {
    let fail = true;
    const { scheduler, saveFn, statuses } = setup(async () => {
      if (fail) throw new Error("EIO");
    });
    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(500);
    expect(statuses.at(-1)).toBe("error");
    expect(scheduler.hasPendingChanges()).toBe(true);

    fail = false;
    await vi.advanceTimersByTimeAsync(4999);
    expect(saveFn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(saveFn).toHaveBeenCalledTimes(2);
    expect(statuses.at(-1)).toBe("saved");
  });

  it("dispose cancela a gravação agendada", async () => {
    const { scheduler, saveFn } = setup();
    scheduler.schedule();
    scheduler.dispose();
    await vi.advanceTimersByTimeAsync(1000);
    expect(saveFn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/persistence/saveScheduler.test.ts`
Expected: FAIL, `Failed to resolve import "./saveScheduler"`

- [ ] **Step 3: Implementar**

`src/persistence/saveScheduler.ts`:
```ts
export type SaveStatus = "saved" | "pending" | "saving" | "error";

export interface SaveSchedulerOptions {
  save: () => Promise<void>;
  onStatus?: (status: SaveStatus) => void;
  debounceMs?: number;
  retryMs?: number;
}

export interface SaveScheduler {
  /** Marca que há mudanças e agenda a gravação (debounce). */
  schedule(): void;
  /** Grava agora se houver mudanças, esperando gravações em andamento. Não lança erro. */
  flush(): Promise<void>;
  hasPendingChanges(): boolean;
  dispose(): void;
}

export function createSaveScheduler({
  save,
  onStatus = () => {},
  debounceMs = 500,
  retryMs = 5000,
}: SaveSchedulerOptions): SaveScheduler {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dirty = false;
  let running: Promise<void> | null = null;

  function clearTimer() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }

  function startTimer(ms: number) {
    clearTimer();
    timer = setTimeout(() => {
      void run();
    }, ms);
  }

  async function run(): Promise<void> {
    clearTimer();
    while (running) await running;
    if (!dirty) return;

    dirty = false;
    onStatus("saving");
    const current: Promise<void> = save()
      .then(
        () => {
          onStatus(dirty ? "pending" : "saved");
        },
        () => {
          dirty = true;
          onStatus("error");
          startTimer(retryMs);
        },
      )
      .finally(() => {
        if (running === current) running = null;
      });
    running = current;
    await current;
  }

  return {
    schedule() {
      dirty = true;
      onStatus("pending");
      startTimer(debounceMs);
    },
    flush: run,
    hasPendingChanges: () => dirty || running !== null,
    dispose: clearTimer,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test src/persistence && pnpm typecheck && pnpm lint`
Expected: todos passam; sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/persistence/saveScheduler.ts src/persistence/saveScheduler.test.ts
git commit -m "feat(persistence): agendador de gravação com debounce e nova tentativa"
```

---

### Task 11: Verificação final e Pull Request

**Files:** nenhum arquivo novo.

- [ ] **Step 1: Rodar tudo do zero**

```bash
rm -rf node_modules && pnpm install --frozen-lockfile
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```
Expected: sem erros; todos os testes de `src/domain` e `src/persistence` passam.

- [ ] **Step 2: Push e PR (confirmar com o usuário antes, é ação externa)**

```bash
git push -u origin feat/fase-1-nucleo
gh pr create --base main --title "Fase 1: núcleo do Kamban (domain, persistence e CI)" --body "$(cat <<'EOF'
## Resumo
- Scaffold Vite + React 19 + TypeScript 6.0 + pnpm, ESLint e Vitest
- CI no GitHub Actions (typecheck, lint, testes, build)
- domain/: schema Zod, quadros, colunas, cartões, hábitos e consulta da tela Hoje
- persistence/: leitura com validação e migração, gravação atômica, backups diários (14), restauração e agendador de gravação

Spec: docs/superpowers/specs/2026-09-23-kamban-design.md
Plano: docs/superpowers/plans/2026-09-23-kamban-fase-1-nucleo.md

## Como testar
pnpm install && pnpm test

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Confirmar que o CI passou no PR**

Run: `gh pr checks --watch`
Expected: job `check` verde. Se falhar, investigar com superpowers:systematic-debugging antes de qualquer correção.

- [ ] **Step 4: Propor a proteção da `main`**

Perguntar ao usuário se deve ativar a proteção da `main` exigindo o check `check` do CI. Só com confirmação:
```bash
gh api -X PUT repos/juannixx/kamban/branches/main/protection \
  -F "required_status_checks[strict]=true" \
  -F "required_status_checks[contexts][]=check" \
  -F "enforce_admins=false" \
  -F "required_pull_request_reviews=null" \
  -F "restrictions=null"
```
