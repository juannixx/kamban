# Kamban: Design da v1

Data: 23/09/2026
Status: aprovado no brainstorming, aguardando revisão da spec escrita

## 1. Objetivo

App kanban pessoal para organizar to-dos, projetos pessoais e rotina. Uso individual, local no computador (macOS), sem login e sem servidor.

### Critérios de sucesso da v1

- Criar quadros com colunas personalizáveis e mover cartões com arrastar e soltar.
- Ver numa tela "Hoje" os hábitos do dia, os cartões atrasados e os cartões com prazo para hoje.
- Marcar hábitos como feitos por dia, com histórico guardado.
- Dados salvos num arquivo JSON numa pasta escolhida pelo usuário (ex.: iCloud Drive), sem perda de dados em caso de queda do app ou arquivo corrompido.
- Instalador `.dmg` gerado automaticamente pelo GitHub Actions a cada tag de versão.

### Fora da v1

Busca, atalhos avançados de teclado, seletor manual de tema (a v1 segue o tema do macOS), streaks e gráficos de hábitos, etiquetas, uso simultâneo em dois computadores, sincronização com a nuvem, versão mobile, teste end-to-end do app empacotado, assinatura Apple do app.

## 2. Stack

Tauri 2, React 19, TypeScript 6.0 (o typescript-eslint ainda não suporta a 7), Vite, Zustand, Zod, dnd-kit, Tailwind CSS, Vitest, React Testing Library, ESLint, pnpm.

## 3. Modelo de dados

Um único arquivo `kamban.json` na pasta de dados escolhida.

```ts
type ISODate = string;      // "YYYY-MM-DD", sem fuso, sempre o dia local
type ISODateTime = string;  // ISO 8601 com fuso, para carimbos de tempo

interface KambanData {
  version: 1;
  boards: Board[];
  cards: Card[];
  habits: Habit[];
  habitLog: HabitLogEntry[];
}

interface Board {
  id: string;
  name: string;
  order: number;
  columns: Column[];
  archived: boolean;
}

interface Column {
  id: string;
  name: string;
  order: number;
  isDone: boolean; // exatamente uma coluna por quadro tem isDone = true
}

interface Card {
  id: string;
  boardId: string;
  columnId: string;
  order: number;
  title: string;
  description?: string;          // Markdown
  dueDate?: ISODate;
  priority?: "low" | "medium" | "high";
  checklist: ChecklistItem[];
  archived: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  completedAt?: ISODateTime;     // preenchido ao entrar na coluna isDone, limpo ao sair
}

interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

interface Habit {
  id: string;
  title: string;
  order: number;
  archived: boolean;
  schedule:
    | { type: "daily" }
    | { type: "weekdays" }                 // segunda a sexta
    | { type: "custom"; days: number[] };  // 0 = domingo ... 6 = sábado, ao menos 1 dia
  createdAt: ISODateTime;
}

interface HabitLogEntry {
  habitId: string;
  date: ISODate; // um registro por dia em que o hábito foi feito; ausência = não feito
}
```

### Regras

- Todo quadro novo nasce com as colunas "A fazer", "Fazendo" e "Feito" (esta com `isDone = true`).
- As colunas podem ser renomeadas, adicionadas, reordenadas e removidas. Remover uma coluna com cartões exige escolher a coluna de destino desses cartões. A coluna `isDone` não pode ser removida sem antes marcar outra como `isDone`.
- Mover um cartão para a coluna `isDone` preenche `completedAt`. Tirar de lá limpa o campo.
- Cartões, quadros e hábitos são arquivados (`archived = true`), não apagados. Excluir de vez é uma ação separada e confirmada.
- `id`s gerados com `crypto.randomUUID()`.
- `order` é um número; reordenar recalcula os valores da lista afetada.
- Desmarcar um hábito remove o registro do `habitLog` daquele dia. Não pode haver registro duplicado (mesmo `habitId` e `date`).

## 4. Telas e interação

### Barra lateral

Hoje, Hábitos, lista de quadros (reordenável por arrastar), "+ Novo quadro" e Configurações.

### Hoje

Três seções, nesta ordem:

1. **Rotina**: hábitos não arquivados cuja programação inclui o dia de hoje, com contador "X/Y feitos". Um clique marca ou desmarca.
2. **Atrasados**: cartões não arquivados com `dueDate` anterior a hoje e fora da coluna `isDone`, ordenados do mais antigo para o mais recente.
3. **Para hoje**: cartões não arquivados com `dueDate` igual a hoje e fora da coluna `isDone`, ordenados por prioridade (alta, média, baixa, sem prioridade).

Cada cartão mostra título, nome do quadro de origem, prazo e prioridade. O checkbox move o cartão para a coluna `isDone` do quadro dele. Clicar no cartão abre o painel de detalhe.

O "hoje" é recalculado quando o app ganha foco e à meia-noite local.

### Quadro

- Colunas lado a lado, com rolagem horizontal quando necessário.
- Arrastar e soltar (dnd-kit): cartões entre colunas e dentro da coluna; colunas entre si.
- "+ Adicionar cartão" no pé de cada coluna: campo de título, Enter cria e mantém o campo aberto para o próximo, Esc fecha.
- Menu da coluna: renomear, marcar como "Feito", remover.
- Menu do quadro: renomear, arquivar.
- O cartão na coluna mostra título, prazo (em vermelho se atrasado), indicador de prioridade e progresso do checklist ("2/5").

### Detalhe do cartão

Painel lateral com título, descrição em Markdown (alternar entre editar e visualizar), prazo, prioridade e checklist (adicionar, marcar, reordenar, remover itens). Botões de arquivar e excluir. Salvamento automático, sem botão de salvar.

### Hábitos

Lista de hábitos com criar, editar título, escolher a programação (todo dia, dias úteis ou dias específicos), reordenar e arquivar.

### Configurações

Mostra a pasta de dados atual, permite trocar de pasta e abre a pasta de backups no Finder.

### Primeira abertura

Tela pedindo a pasta de dados, sugerindo o iCloud Drive. Se a pasta já tiver um `kamban.json` válido, ele é carregado. Se não tiver, é criado um arquivo novo com um quadro "To-do" padrão. O caminho da pasta é guardado na configuração do app (fora da pasta de dados).

## 5. Arquitetura

```
src/
  domain/       regras puras em TypeScript, sem React e sem Tauri
  persistence/  leitura, gravação, validação (Zod), backups, migrações
  store/        estado em memória (Zustand), chama domain e agenda gravação
  ui/           componentes React
src-tauri/      shell Tauri (Rust mínimo, plugins fs e dialog)
```

- **domain/**: funções puras que recebem `KambanData` e devolvem um novo `KambanData` (mover cartão, reordenar, criar e remover coluna, marcar hábito) e consultas (montar a tela Hoje, `isHabitDueOn(habit, date)`). Sem efeitos colaterais.
- **persistence/**: depende de uma interface `FileSystem` (ler, escrever, renomear, listar, remover, data de modificação). Em produção é implementada com `@tauri-apps/plugin-fs`; nos testes, com um fs em memória.
- **store/**: um store Zustand com os dados e as ações. Cada ação aplica a função de domain e notifica a persistência.
- **ui/**: não chama o fs diretamente; só o store.

## 6. Persistência

### Gravação

1. Toda alteração atualiza o estado em memória imediatamente.
2. As gravações são agrupadas com debounce de 500 ms. Ao fechar a janela, uma gravação final é feita antes de encerrar.
3. Gravação atômica: escreve `kamban.json.tmp` e renomeia para `kamban.json`.
4. Backup diário: na primeira gravação de cada dia, copia o arquivo atual para `backups/kamban-YYYY-MM-DD.json`. Mantém os 14 backups mais recentes e remove os mais antigos.

### Leitura e validação

- O arquivo é validado com um schema Zod ao carregar.
- Antes da validação, as migrações atualizam arquivos com `version` antiga para a versão atual.
- Arquivo com `version` maior que a suportada pelo app: o app não abre o arquivo e pede para atualizar o app.

### Tratamento de erros

| Situação | Comportamento |
|---|---|
| Arquivo inválido ou corrompido na abertura | Não sobrescreve. Mostra o erro e oferece restaurar o backup mais recente ou escolher outra pasta. |
| Falha ao gravar (pasta ausente, sem espaço, sem permissão) | Indicador persistente "Não salvo", nova tentativa a cada 5 s e ao ganhar foco. Dados continuam na memória. |
| Arquivo alterado por fora (ex.: outro Mac via iCloud) | Ao ganhar foco, compara a data de modificação com a da última gravação. Sem edições pendentes: recarrega. Com edições pendentes: pergunta qual versão manter (a do app ou a do disco). |
| Pasta de dados não encontrada ao abrir | Volta para a tela de escolha de pasta, informando o caminho anterior. |

## 7. Testes

- **Vitest** em `domain/` e `persistence/`, com TDD. Casos obrigatórios:
  - mover cartão entre colunas e dentro da coluna, com recálculo de `order`;
  - `completedAt` ao entrar e sair da coluna `isDone`;
  - remoção de coluna com cartões e proteção da coluna `isDone`;
  - montagem da tela Hoje (atrasados, para hoje, ordenação, exclusão de arquivados e concluídos);
  - `isHabitDueOn` para `daily`, `weekdays` e `custom` em todos os dias da semana;
  - marcar e desmarcar hábito sem duplicar registro;
  - validação de arquivo inválido, migração de versão e recusa de versão futura;
  - gravação atômica, criação do backup diário e rotação dos 14 backups (fs em memória).
- **React Testing Library** para os fluxos: criar cartão numa coluna, marcar cartão como feito na tela Hoje, marcar hábito.
- Fora da v1: teste end-to-end do app empacotado.

## 8. CI e entrega (GitHub Actions)

- **`.github/workflows/ci.yml`**: em todo pull request e em push na `main`. Ubuntu, pnpm install, typecheck, lint, testes e build do frontend.
- **`.github/workflows/release.yml`**: em push de tag `v*`. Runner macOS, build Tauri universal (Intel e Apple Silicon), publica o `.dmg` num GitHub Release. O app não é assinado; na primeira abertura, "clique direito > Abrir".

## 9. Fluxo de trabalho

- A implementação é dividida em duas fases, cada uma com seu plano e seu PR: Fase 1 (núcleo: scaffold, CI, domain e persistence) e Fase 2 (shell Tauri, store, telas e release). Nada é commitado direto na `main`; cada fase vira branch e PR, com CI verde e revisão humana antes do merge.
- Proteção da `main` exigindo o CI verde será proposta quando o `ci.yml` existir, e só aplicada com confirmação.
