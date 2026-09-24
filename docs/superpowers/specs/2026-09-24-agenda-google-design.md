# Kamban: Integração com a Agenda do Google

Data: 24/09/2026
Status: aprovado no brainstorming, aguardando revisão da spec escrita
Complementa: `docs/superpowers/specs/2026-09-23-kamban-design.md`

## 1. Objetivo

Mostrar na tela Hoje os eventos do dia de várias contas Google (uma pessoal @gmail.com e uma de trabalho @yousalaw.com), somente leitura.

### Mudança de premissa

A v1 era "local, sem login e sem servidor". Com esta integração passa a ser: **sem login próprio e sem servidor próprio; conexão opcional com o Google feita direto do Mac do usuário**. O `kamban.json` continua sem nenhum dado da agenda.

### Critérios de sucesso

- Conectar uma ou mais contas Google pelo navegador, sem servidor intermediário.
- Por conta, escolher o modo: "com detalhes" (título e horário) ou "só horários" (apenas blocos ocupados, sem título).
- No modo "com detalhes", escolher quais agendas da conta aparecem.
- Ver na tela Hoje uma seção "Agenda" com os eventos do dia de todas as contas, com cor por conta.
- Sem internet, ver os últimos eventos baixados com aviso.
- Desconectar uma conta apaga a permissão e o cache dela.

### Fora desta entrega

Criar, editar ou apagar eventos; transformar evento em cartão; outros dias além de hoje; visão de semana; descrição, local e participantes dos eventos; outros provedores (iCloud, Outlook); sincronizar a configuração das contas entre Macs.

## 2. Conta de trabalho e políticas da empresa

A conta @yousalaw.com é usada **apenas no modo "só horários"**. Esse modo usa somente o escopo `https://www.googleapis.com/auth/calendar.freebusy`: o Google devolve apenas início e fim de blocos ocupados, então títulos, participantes e descrições (que podem conter dados de cliente) nunca chegam ao Mac. Isso atende à Política YOUSA #COMP-04 (proteção de dados). Recomendação registrada: avisar o escritório de que o app lê a disponibilidade da agenda. Se o administrador do Workspace bloquear apps de terceiros, a conexão só funciona depois de a TI liberar o app.

O app não impede tecnicamente o modo "com detalhes" para nenhum domínio; a escolha é do usuário no momento de conectar.

## 3. Onde cada dado fica

| Dado | Local | Motivo |
|---|---|---|
| Token de renovação de cada conta | Chaves do macOS (Keychain), serviço `com.juannixx.kamban.google`, conta = e-mail | Credencial; nunca em arquivo nem na parte web. |
| Contas conectadas, modo, cor, agendas escolhidas | `settings.json` do app (plugin-store), chave `calendarAccounts` | Configuração deste Mac; não vai para o iCloud. |
| Eventos do dia (cache) | `calendar-cache.json` na pasta de cache do app (`$APPCACHE`) | Descartável; refeito na próxima atualização. Guarda só o dia de hoje. |

### Modelos

```ts
interface CalendarAccount {
  id: string;                 // gerado pelo app
  email: string;
  mode: "details" | "busy";
  color: string;              // uma das cores da paleta da agenda
  calendars: { id: string; name: string; selected: boolean }[]; // vazio no modo "busy"
}

interface AgendaItem {
  accountId: string;
  kind: "event" | "busy";
  title?: string;             // só quando kind = "event"
  start: string;              // ISO 8601 com fuso; em dia inteiro, "YYYY-MM-DD"
  end: string;
  allDay: boolean;
}

interface AgendaCache {
  date: string;               // "YYYY-MM-DD" local
  accounts: Record<string, { fetchedAt: string; items: AgendaItem[] }>; // chave = accountId
}
```

### Regras

- Modo "details": escopos `openid email https://www.googleapis.com/auth/calendar.readonly`. Busca `calendarList` e `events.list` (com `singleEvents=true`, `orderBy=startTime`, limites do dia e `fields` restrito a id, summary, start, end, status). Eventos com `status = "cancelled"` são ignorados. Evento sem título aparece como "(sem título)".
- Modo "busy": escopos `openid email https://www.googleapis.com/auth/calendar.freebusy`. Consulta `freeBusy` da agenda principal (`primary`). Não lista agendas.
- Ao conectar no modo "details", a agenda principal vem marcada e as demais desmarcadas.
- Blocos "busy" que se tocam ou se sobrepõem são unidos em um só.
- Ordem na tela: eventos de dia inteiro primeiro (por título), depois por início; empate por fim; depois por conta.
- Limites do dia: da meia-noite local de hoje até a meia-noite local de amanhã, no fuso do Mac (inclui dias com mudança de horário de verão).
- Um evento que começa antes de hoje e termina hoje aparece; o horário exibido é o de início real.

## 4. Telas e interação

### Tela Hoje: seção "Agenda"

Primeira seção da tela, antes de Rotina.

- Cada item: horário de início (ou "Dia todo"), título (ou "Ocupado (até HH:MM)" nos blocos "busy") e um ponto com a cor da conta.
- Itens cujo fim já passou ficam esmaecidos.
- Cabeçalho da seção mostra o status, clicável para atualizar agora:
  - "atualizada às HH:MM" quando todas as contas atualizaram;
  - "sem conexão · dados de HH:MM" quando alguma conta está usando o cache;
  - "reconecte a conta <e-mail>" quando uma permissão foi revogada ou expirou.
- Sem nenhuma conta conectada: "Conecte sua agenda do Google em Configurações."
- Com contas conectadas e nenhum evento: "Nenhum evento hoje."
- Clicar num evento não faz nada nesta entrega.

### Quando atualiza

Ao abrir o app, ao ganhar foco (no máximo uma vez a cada 60 s), a cada 15 minutos e na virada do dia. Uma atualização em andamento não é repetida em paralelo.

### Configurações: seção "Agenda do Google"

- Botão "Conectar conta" abre a escolha de modo ("Com detalhes" ou "Só horários, sem títulos") e depois o navegador.
- Cada conta conectada: e-mail, modo (texto, não editável), seletor de cor, lista de agendas com caixa de marcar (só no modo "details") e botão "Desconectar" (com confirmação).
- Texto fixo: "O app só lê a agenda. Contas em 'Só horários' não recebem títulos nem detalhes dos eventos."
- Para trocar de modo, o usuário desconecta e conecta de novo.
- Conectar uma conta que já está conectada substitui a anterior (mesmo e-mail).

## 5. Arquitetura

### Rust (`src-tauri/src/google/`)

- `oauth.rs`: fluxo OAuth 2.0 para apps instalados com PKCE (S256). Servidor HTTP temporário em `127.0.0.1` com porta aleatória recebe o `code`; o navegador padrão abre a URL de autorização. `state` aleatório conferido no retorno. Tempo máximo de espera: 5 minutos. Troca o `code` por tokens; o e-mail vem do `id_token`.
- `keychain.rs`: salvar, ler e apagar o token de renovação.
- `api.rs`: cliente HTTPS (timeout 10 s). Renova o token de acesso quando necessário. Implementa `calendarList`, `events.list` e `freeBusy`, convertendo para `AgendaItem`.
- `errors.rs`: erros classificados: `Offline`, `Revoked` (invalid_grant ou 401 após renovação), `AdminBlocked` (erro `admin_policy_enforced` ou `access_denied` por política do domínio), `Cancelled`, `Timeout`, `Other(mensagem)`.
- Comandos Tauri:
  - `google_connect(mode) -> { email }`
  - `google_disconnect(email)`
  - `google_list_calendars(email) -> { id, name, primary }[]`
  - `google_fetch_day(accounts: { email, mode, calendarIds }[], dayStart, dayEnd) -> { email, ok?: AgendaItem[] (sem accountId), error?: ErrorKind }[]`
- Credencial do app: `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` lidos em tempo de compilação (`option_env!`). Sem elas, os comandos respondem `Other("Integração com o Google não configurada neste build")`. Nunca são commitadas: localmente em `src-tauri/.env` (no `.gitignore`), no GitHub como secrets do `release.yml`.

### TypeScript

- `src/domain/agenda.ts`: funções puras (limites do dia, união de blocos, ordenação, passado/futuro, montagem da lista final a partir do cache).
- `src/platform/googleCalendar.ts`: única camada que chama os comandos Rust (interface `CalendarService`, com implementação falsa nos testes).
- `src/store/agendaStore.ts`: store Zustand separado do principal. Contas (lidas e gravadas via `Settings`), cache (via `FileSystem` na pasta de cache), status por conta, atualização e virada do dia.
- UI: `src/ui/today/AgendaSection.tsx` e `src/ui/settings/GoogleAccounts.tsx`.

### Tratamento de erros

| Situação | Comportamento |
|---|---|
| Sem internet ou Google indisponível | Usa o cache da conta e marca "sem conexão"; tenta de novo na próxima atualização. |
| Permissão revogada ou expirada | Status "reconecte a conta"; itens da conta saem da tela e do cache; demais contas seguem. |
| Workspace bloqueia o app | Na conexão: "O administrador da conta bloqueou este app. Peça à TI para liberar o Kamban." |
| Login cancelado ou 5 min sem resposta | Fecha o servidor local; nenhuma mudança. |
| Falha ao ler ou gravar o cache | Segue sem cache; aviso só no console. |
| Build sem credencial do Google | Seção de Configurações mostra "Integração com o Google não configurada neste build" e esconde "Conectar conta". |

## 6. Testes

- `domain/agenda` com TDD: normalização (evento com horário, dia inteiro, sem título, cancelado), união de blocos, ordenação, passado/futuro, limites do dia com mudança de horário de verão.
- `agendaStore` com serviço falso: atualização por conta, erro isolado por conta, cache sem conexão, "reconecte", virada do dia, desconectar limpa cache, sem atualizações simultâneas.
- UI (jsdom): seção Agenda (vazia, sem contas, com eventos, com blocos, status) e Configurações (conectar nos dois modos, marcar agendas, desconectar, build sem credencial).
- Rust (`cargo test`): PKCE, leitura do e-mail no `id_token`, conversão de respostas de exemplo do Google, classificação de erros, união de limites de horário. Nenhum teste chama o Google.
- Manual: conectar @gmail.com com detalhes, conectar @yousalaw.com em "só horários" (se o Workspace permitir), abrir sem internet, desconectar.

## 7. CI e entrega

- `ci.yml` ganha um job `rust` no Ubuntu que instala as bibliotecas de sistema do Tauri e roda `cargo test` em `src-tauri`.
- `release.yml` passa `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` dos secrets do repositório para o build.
- Guia `docs/google-calendar-setup.md`: criar projeto no Google Cloud, ativar a Calendar API, tela de consentimento "Externo" publicada em "Produção" sem verificação (evita a expiração de 7 dias do modo "Teste"; mostra o aviso de "app não verificado" na primeira conexão), criar credencial "App para computador", configurar `src-tauri/.env` e os secrets do GitHub.
- Branch `feat/agenda-google`, um PR, CI verde e revisão humana antes do merge.
