# Kamban: Agenda do Google Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar na tela Hoje os eventos do dia de várias contas Google (modo "com detalhes" ou "só horários"), somente leitura, com login OAuth feito no próprio Mac, tokens nas Chaves do macOS e cache local para uso sem internet.

**Architecture:** O lado Rust (`src-tauri/src/google/`) faz OAuth (PKCE + servidor local em 127.0.0.1), guarda o token de renovação no Keychain e chama a API do Google, expondo 5 comandos Tauri. O lado TypeScript segue o padrão da Fase 2: regras puras em `src/domain/agenda.ts`, um store Zustand próprio (`src/store/agendaStore.ts`) com dependências injetadas (serviço, configurações, cache, relógio), adaptadores em `src/platform/` e as telas em `src/ui/`. Nada da agenda entra no `kamban.json`.

**Tech Stack:** Rust (reqwest 0.12 com rustls, keyring 3 com `apple-native`, sha2 0.10, base64 0.22, getrandom 0.2, url 2, tokio 1), Tauri 2.11, React 19, Zustand 5, Zod 4, Vitest 5 + jsdom + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-24-agenda-google-design.md`

## Global Constraints

- Somente `src/platform/*` e `src/main.tsx` importam `@tauri-apps/*`. `src/ui/*` e `src/store/*` nunca importam Tauri.
- `src/domain/*` continua puro (pode fazer `new Date(string)` para converter, nunca `Date.now()`/`new Date()` sem argumento, nem I/O).
- Nada da agenda é gravado no `kamban.json`. Tokens só no Keychain (serviço `com.juannixx.kamban.google`, conta = e-mail). Configuração das contas no `settings.json` (chave `calendarAccounts`). Cache em `calendar-cache.json` na pasta de cache do app.
- Escopos: modo `details` = `openid email https://www.googleapis.com/auth/calendar.readonly`; modo `busy` = `openid email https://www.googleapis.com/auth/calendar.freebusy`.
- `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` nunca são commitados (o repositório é público). Entram no build por variável de ambiente ou `src-tauri/.env` (no `.gitignore`).
- Timeout HTTP: 10 s. Espera do login: 5 min. Atualização da agenda: a cada 15 min, ao ganhar foco no máximo 1 vez por minuto e na virada do dia.
- Seletores do Zustand devolvem só valores estáveis; derive com `useMemo`.
- Testes de UI: `*.test.tsx` com `// @vitest-environment jsdom` na primeira linha e `afterEach(cleanup)`; saída sem avisos (`act`, `console.warn` sem espião).
- Textos da interface em português do Brasil. Horas como `HH:MM`, datas como `DD/MM`.
- Nunca commitar na `main`. Tudo na branch `feat/agenda-google`, entregue num único PR.
- Toda mensagem de commit termina com uma linha em branco seguida do trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` (fora do assunto; omitido nos exemplos por brevidade).
- Antes de cada commit: `pnpm test && pnpm typecheck && pnpm lint`; nas tarefas Rust também `cargo test --manifest-path src-tauri/Cargo.toml`.
- Rust: rodar `source "$HOME/.cargo/env"` no mesmo comando antes de `cargo`/`pnpm tauri`.

## File Structure

```
src-tauri/
  build.rs                       lê GOOGLE_CLIENT_ID/SECRET de src-tauri/.env quando não vêm do ambiente
  .env.example                   modelo (commitado); .env real fica no .gitignore
  Cargo.toml                     + reqwest, keyring, sha2, base64, getrandom, url, tokio
  src/lib.rs                     + mod google, manage(GoogleState), invoke_handler
  src/google/
    mod.rs                       módulos
    errors.rs                    GoogleError (serializado para o JS) e classificação
    pkce.rs                      verifier aleatório e challenge S256
    parse.rs                     funções puras: callback do login, resposta de token, e-mail do id_token,
                                 conversão de calendarList, events e freeBusy
    keychain.rs                  salvar/ler/apagar token de renovação
    oauth.rs                     credencial do app, escopos, fluxo de login com servidor local
    api.rs                       GoogleState: cliente HTTP, token de acesso em memória, chamadas à API
    commands.rs                  comandos Tauri
.github/workflows/ci.yml         + job "rust" (cargo test no Ubuntu)
.github/workflows/release.yml    + secrets do Google no build
docs/google-calendar-setup.md    guia de configuração no Google Cloud
src/
  domain/agenda.ts               modelos, schemas, cores, limites do dia, montagem das linhas da agenda
  store/agendaStore.ts           createAgendaStore, CalendarService, AgendaSettings, AgendaCacheStore, erros
  store/agendaCache.ts           cache em arquivo sobre FileSystem
  store/testing.ts               + fakeCalendarService, memoryAgendaCache; memorySettings com contas
  platform/googleCalendar.ts     CalendarService sobre os comandos Tauri
  platform/settings.ts           + getCalendarAccounts/setCalendarAccounts
  platform/agendaLifecycle.ts    foco e timer da agenda
  ui/context.tsx                 + agenda store no AppProvider, useAgenda
  ui/format.ts                   + cores da agenda
  ui/testing.tsx                 setupApp cria também o agenda store
  ui/today/AgendaSection.tsx     seção Agenda da tela Hoje
  ui/settings/GoogleAccounts.tsx seção Agenda do Google em Configurações
  main.tsx                       monta o agenda store
```

---

### Task 1: Rust puro (erros, PKCE, conversões) e CI do Rust

**Files:**
- Create: `src-tauri/src/google/mod.rs`, `src-tauri/src/google/errors.rs`, `src-tauri/src/google/pkce.rs`, `src-tauri/src/google/parse.rs`, `src-tauri/.env.example`
- Modify: `src-tauri/Cargo.toml`, `src-tauri/build.rs`, `src-tauri/src/lib.rs` (só `mod google;`), `.gitignore`, `.github/workflows/ci.yml`

**Interfaces:**
- Produces (Rust, `crate::google`):
  - `errors::GoogleError` (enum serializado como `{ "kind": "...", "message"?: "..." }`, variantes `NotConfigured`, `Offline(String)`, `Revoked`, `AdminBlocked`, `Cancelled`, `Timeout`, `Other(String)`), `errors::classify_oauth_error(code: &str) -> GoogleError`, `errors::from_reqwest(err: &reqwest::Error) -> GoogleError`
  - `pkce::random_token(bytes: usize) -> String`, `pkce::challenge(verifier: &str) -> String`
  - `parse::Callback { code, state, error: Option<String> }`, `parse::parse_callback(request_line: &str) -> Option<Callback>`
  - `parse::TokenResponse { access_token: String, expires_in: u64, refresh_token: Option<String>, id_token: Option<String> }`, `parse::parse_token_response(status: u16, body: &str) -> Result<TokenResponse, GoogleError>`
  - `parse::email_from_id_token(token: &str) -> Option<String>`
  - `parse::RawItem { kind: String, title: Option<String>, start: String, end: String, all_day: bool }` (serializado em camelCase; `title` omitido quando `None`)
  - `parse::CalendarInfo { id: String, name: String, primary: bool }`
  - `parse::calendar_list(body: &str) -> Result<Vec<CalendarInfo>, GoogleError>`, `parse::events_to_items(body: &str) -> Result<Vec<RawItem>, GoogleError>`, `parse::freebusy_to_items(body: &str) -> Result<Vec<RawItem>, GoogleError>`

- [ ] **Step 1: Dependências e leitura do `.env` no build**

Em `src-tauri/Cargo.toml`, na seção `[dependencies]`, acrescente:
```toml
reqwest = { version = "0.12", default-features = false, features = ["json", "rustls-tls"] }
keyring = { version = "3", features = ["apple-native"] }
sha2 = "0.10"
base64 = "0.22"
getrandom = "0.2"
url = "2"
tokio = { version = "1", features = ["net", "io-util", "time", "sync"] }
```

`src-tauri/build.rs`:
```rust
/// Lê GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET de src-tauri/.env quando não vêm do ambiente.
/// Os valores ficam disponíveis no código via option_env!. O .env nunca é commitado.
fn main() {
  println!("cargo:rerun-if-changed=.env");
  for key in ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] {
    println!("cargo:rerun-if-env-changed={key}");
  }
  if let Ok(text) = std::fs::read_to_string(".env") {
    for line in text.lines() {
      let line = line.trim();
      if line.is_empty() || line.starts_with('#') {
        continue;
      }
      if let Some((key, value)) = line.split_once('=') {
        let key = key.trim();
        let is_google = key == "GOOGLE_CLIENT_ID" || key == "GOOGLE_CLIENT_SECRET";
        if is_google && std::env::var(key).is_err() {
          println!("cargo:rustc-env={key}={}", value.trim().trim_matches('"'));
        }
      }
    }
  }
  tauri_build::build()
}
```

`src-tauri/.env.example`:
```
# Copie para src-tauri/.env e preencha com a credencial "App para computador" do Google Cloud.
# O arquivo .env nunca vai para o git. Veja docs/google-calendar-setup.md.
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

No `.gitignore` da raiz, acrescente a linha:
```
src-tauri/.env
```

Em `src-tauri/src/lib.rs`, acrescente `mod google;` logo depois das linhas `use` do topo.

`src-tauri/src/google/mod.rs`:
```rust
//! Integração somente leitura com a Agenda do Google.

pub mod errors;
pub mod parse;
pub mod pkce;
```

- [ ] **Step 2: Escrever os testes que falham**

Os testes ficam no próprio arquivo de cada módulo (`#[cfg(test)] mod tests`). Crie os três arquivos com as funções vazias abaixo (`todo!()`) e os testes completos, para ver o RED.

`src-tauri/src/google/errors.rs` (testes):
```rust
#[cfg(test)]
mod tests {
  use super::*;
  use serde_json::json;

  #[test]
  fn serializa_no_formato_que_o_js_espera() {
    assert_eq!(serde_json::to_value(GoogleError::Revoked).unwrap(), json!({ "kind": "revoked" }));
    assert_eq!(
      serde_json::to_value(GoogleError::Offline("sem rede".into())).unwrap(),
      json!({ "kind": "offline", "message": "sem rede" })
    );
    assert_eq!(serde_json::to_value(GoogleError::AdminBlocked).unwrap(), json!({ "kind": "adminBlocked" }));
    assert_eq!(serde_json::to_value(GoogleError::NotConfigured).unwrap(), json!({ "kind": "notConfigured" }));
  }

  #[test]
  fn classifica_erros_do_oauth() {
    assert_eq!(classify_oauth_error("invalid_grant"), GoogleError::Revoked);
    assert_eq!(classify_oauth_error("admin_policy_enforced"), GoogleError::AdminBlocked);
    assert_eq!(classify_oauth_error("org_internal"), GoogleError::AdminBlocked);
    assert_eq!(classify_oauth_error("access_denied"), GoogleError::Cancelled);
    assert_eq!(classify_oauth_error("xyz"), GoogleError::Other("Erro do Google: xyz".into()));
  }
}
```

`src-tauri/src/google/pkce.rs` (testes):
```rust
#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn challenge_segue_o_exemplo_da_rfc_7636() {
    assert_eq!(
      challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    );
  }

  #[test]
  fn random_token_e_url_safe_e_muda_a_cada_chamada() {
    let a = random_token(32);
    let b = random_token(32);
    assert_eq!(a.len(), 43);
    assert_ne!(a, b);
    assert!(a.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
  }
}
```

`src-tauri/src/google/parse.rs` (testes):
```rust
#[cfg(test)]
mod tests {
  use super::*;
  use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};

  #[test]
  fn callback_com_code_state_e_erro() {
    assert_eq!(
      parse_callback("GET /?state=abc&code=4%2F0xyz HTTP/1.1"),
      Some(Callback { code: Some("4/0xyz".into()), state: Some("abc".into()), error: None })
    );
    assert_eq!(
      parse_callback("GET /?error=access_denied&state=abc HTTP/1.1"),
      Some(Callback { code: None, state: Some("abc".into()), error: Some("access_denied".into()) })
    );
    assert_eq!(parse_callback("GET /favicon.ico HTTP/1.1"), None);
    assert_eq!(parse_callback("POST /?code=1 HTTP/1.1"), None);
    assert_eq!(parse_callback(""), None);
  }

  #[test]
  fn resposta_de_token_ok_e_erro() {
    let ok = parse_token_response(
      200,
      r#"{"access_token":"at","expires_in":3599,"refresh_token":"rt","id_token":"x.y.z","scope":"s","token_type":"Bearer"}"#,
    )
    .unwrap();
    assert_eq!(ok.access_token, "at");
    assert_eq!(ok.expires_in, 3599);
    assert_eq!(ok.refresh_token.as_deref(), Some("rt"));
    assert_eq!(
      parse_token_response(400, r#"{"error":"invalid_grant","error_description":"Token has been expired or revoked."}"#)
        .err(),
      Some(GoogleError::Revoked)
    );
    assert!(matches!(parse_token_response(500, "oops"), Err(GoogleError::Other(_))));
  }

  #[test]
  fn email_do_id_token() {
    let payload = URL_SAFE_NO_PAD.encode(r#"{"email":"pessoa@gmail.com","sub":"1"}"#);
    assert_eq!(email_from_id_token(&format!("h.{payload}.s")), Some("pessoa@gmail.com".into()));
    assert_eq!(email_from_id_token("sem-pontos"), None);
    assert_eq!(email_from_id_token("h.%%%.s"), None);
  }

  #[test]
  fn lista_de_agendas_com_a_principal_primeiro() {
    let body = r#"{"items":[
      {"id":"feriados@group","summary":"Feriados"},
      {"id":"pessoa@gmail.com","summary":"pessoa@gmail.com","summaryOverride":"Pessoal","primary":true},
      {"id":"familia@group"}
    ]}"#;
    let list = calendar_list(body).unwrap();
    assert_eq!(
      list,
      vec![
        CalendarInfo { id: "pessoa@gmail.com".into(), name: "Pessoal".into(), primary: true },
        CalendarInfo { id: "familia@group".into(), name: "familia@group".into(), primary: false },
        CalendarInfo { id: "feriados@group".into(), name: "Feriados".into(), primary: false },
      ]
    );
  }

  #[test]
  fn eventos_com_horario_dia_inteiro_sem_titulo_e_cancelado() {
    let body = r#"{"items":[
      {"summary":"Dentista","status":"confirmed","start":{"dateTime":"2026-09-24T08:30:00-03:00"},"end":{"dateTime":"2026-09-24T09:30:00-03:00"}},
      {"summary":"Aniversário","start":{"date":"2026-09-24"},"end":{"date":"2026-09-25"}},
      {"start":{"dateTime":"2026-09-24T12:00:00-03:00"},"end":{"dateTime":"2026-09-24T13:00:00-03:00"}},
      {"summary":"   ","start":{"dateTime":"2026-09-24T14:00:00-03:00"},"end":{"dateTime":"2026-09-24T15:00:00-03:00"}},
      {"summary":"Cancelado","status":"cancelled","start":{"dateTime":"2026-09-24T16:00:00-03:00"},"end":{"dateTime":"2026-09-24T17:00:00-03:00"}},
      {"summary":"Sem fim","start":{"dateTime":"2026-09-24T18:00:00-03:00"}}
    ]}"#;
    let items = events_to_items(body).unwrap();
    assert_eq!(items.len(), 4);
    assert_eq!(
      items[0],
      RawItem {
        kind: "event".into(),
        title: Some("Dentista".into()),
        start: "2026-09-24T08:30:00-03:00".into(),
        end: "2026-09-24T09:30:00-03:00".into(),
        all_day: false,
      }
    );
    assert_eq!(items[1].all_day, true);
    assert_eq!(items[1].start, "2026-09-24");
    assert_eq!(items[2].title.as_deref(), Some("(sem título)"));
    assert_eq!(items[3].title.as_deref(), Some("(sem título)"));
    assert!(events_to_items("{}").unwrap().is_empty());
    assert!(matches!(events_to_items("não é json"), Err(GoogleError::Other(_))));
  }

  #[test]
  fn freebusy_vira_blocos_sem_titulo() {
    let body = r#"{"calendars":{"primary":{"busy":[
      {"start":"2026-09-24T13:00:00Z","end":"2026-09-24T14:00:00Z"}
    ]}}}"#;
    let items = freebusy_to_items(body).unwrap();
    assert_eq!(
      items,
      vec![RawItem {
        kind: "busy".into(),
        title: None,
        start: "2026-09-24T13:00:00Z".into(),
        end: "2026-09-24T14:00:00Z".into(),
        all_day: false,
      }]
    );
    let json = serde_json::to_value(&items[0]).unwrap();
    assert!(json.get("title").is_none());
    assert_eq!(json["allDay"], false);
    let with_error = r#"{"calendars":{"primary":{"errors":[{"domain":"global","reason":"notFound"}],"busy":[]}}}"#;
    assert!(matches!(freebusy_to_items(with_error), Err(GoogleError::Other(_))));
  }
}
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `source "$HOME/.cargo/env" && cargo test --manifest-path src-tauri/Cargo.toml google`
Expected: FAIL (os `todo!()` entram em pânico, ou erros de compilação por funções ainda sem corpo).

- [ ] **Step 4: Implementar**

`src-tauri/src/google/errors.rs` (acima dos testes):
```rust
use serde::Serialize;

/// Erros da integração, no formato que o JS recebe: { kind, message? }.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", content = "message", rename_all = "camelCase")]
pub enum GoogleError {
  NotConfigured,
  Offline(String),
  Revoked,
  AdminBlocked,
  Cancelled,
  Timeout,
  Other(String),
}

/// Códigos de erro do OAuth do Google (resposta de token ou retorno do login).
pub fn classify_oauth_error(code: &str) -> GoogleError {
  match code {
    "invalid_grant" => GoogleError::Revoked,
    "admin_policy_enforced" | "org_internal" => GoogleError::AdminBlocked,
    "access_denied" => GoogleError::Cancelled,
    other => GoogleError::Other(format!("Erro do Google: {other}")),
  }
}

pub fn from_reqwest(err: &reqwest::Error) -> GoogleError {
  if err.is_timeout() || err.is_connect() || err.is_request() {
    GoogleError::Offline(err.to_string())
  } else {
    GoogleError::Other(err.to_string())
  }
}
```

`src-tauri/src/google/pkce.rs`:
```rust
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use sha2::{Digest, Sha256};

/// Texto aleatório url-safe com `bytes` bytes de entropia (32 bytes = 43 caracteres).
pub fn random_token(bytes: usize) -> String {
  let mut buf = vec![0u8; bytes];
  getrandom::getrandom(&mut buf).expect("gerador aleatório do sistema indisponível");
  URL_SAFE_NO_PAD.encode(buf)
}

/// Code challenge S256 do PKCE (RFC 7636).
pub fn challenge(verifier: &str) -> String {
  URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}
```

`src-tauri/src/google/parse.rs`:
```rust
use std::collections::HashMap;

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde::{Deserialize, Serialize};
use url::Url;

use super::errors::{classify_oauth_error, GoogleError};

#[derive(Debug, PartialEq, Eq)]
pub struct Callback {
  pub code: Option<String>,
  pub state: Option<String>,
  pub error: Option<String>,
}

/// Lê a primeira linha da requisição HTTP que o navegador faz ao voltar do login.
/// Devolve None para requisições que não são o retorno (ex.: /favicon.ico).
pub fn parse_callback(request_line: &str) -> Option<Callback> {
  let mut parts = request_line.split_whitespace();
  if parts.next()? != "GET" {
    return None;
  }
  let target = parts.next()?;
  let url = Url::parse(&format!("http://127.0.0.1{target}")).ok()?;
  let mut callback = Callback { code: None, state: None, error: None };
  for (key, value) in url.query_pairs() {
    match key.as_ref() {
      "code" => callback.code = Some(value.into_owned()),
      "state" => callback.state = Some(value.into_owned()),
      "error" => callback.error = Some(value.into_owned()),
      _ => {}
    }
  }
  if callback.code.is_none() && callback.error.is_none() {
    None
  } else {
    Some(callback)
  }
}

#[derive(Debug, Deserialize)]
pub struct TokenResponse {
  pub access_token: String,
  pub expires_in: u64,
  pub refresh_token: Option<String>,
  pub id_token: Option<String>,
}

#[derive(Deserialize)]
struct TokenError {
  error: String,
}

pub fn parse_token_response(status: u16, body: &str) -> Result<TokenResponse, GoogleError> {
  if (200..300).contains(&status) {
    return serde_json::from_str(body)
      .map_err(|e| GoogleError::Other(format!("Resposta de token inesperada: {e}")));
  }
  match serde_json::from_str::<TokenError>(body) {
    Ok(err) => Err(classify_oauth_error(&err.error)),
    Err(_) => Err(GoogleError::Other(format!("O Google respondeu {status} ao pedir o token"))),
  }
}

/// E-mail do usuário a partir do id_token (JWT). O token veio direto do Google por HTTPS,
/// então só a leitura do payload é necessária.
pub fn email_from_id_token(token: &str) -> Option<String> {
  let payload = token.split('.').nth(1)?;
  let bytes = URL_SAFE_NO_PAD.decode(payload.trim_end_matches('=')).ok()?;
  let value: serde_json::Value = serde_json::from_slice(&bytes).ok()?;
  value.get("email")?.as_str().map(str::to_owned)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RawItem {
  pub kind: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub title: Option<String>,
  pub start: String,
  pub end: String,
  pub all_day: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CalendarInfo {
  pub id: String,
  pub name: String,
  pub primary: bool,
}

fn unexpected(e: serde_json::Error) -> GoogleError {
  GoogleError::Other(format!("Resposta inesperada do Google: {e}"))
}

#[derive(Deserialize)]
struct CalendarEntry {
  id: String,
  summary: Option<String>,
  #[serde(rename = "summaryOverride")]
  summary_override: Option<String>,
  #[serde(default)]
  primary: bool,
}

#[derive(Deserialize)]
struct CalendarListResponse {
  #[serde(default)]
  items: Vec<CalendarEntry>,
}

pub fn calendar_list(body: &str) -> Result<Vec<CalendarInfo>, GoogleError> {
  let parsed: CalendarListResponse = serde_json::from_str(body).map_err(unexpected)?;
  let mut list: Vec<CalendarInfo> = parsed
    .items
    .into_iter()
    .map(|entry| CalendarInfo {
      name: entry.summary_override.or(entry.summary).unwrap_or_else(|| entry.id.clone()),
      id: entry.id,
      primary: entry.primary,
    })
    .collect();
  list.sort_by(|a, b| b.primary.cmp(&a.primary).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
  Ok(list)
}

#[derive(Deserialize)]
struct EventTime {
  #[serde(rename = "dateTime")]
  date_time: Option<String>,
  date: Option<String>,
}

#[derive(Deserialize)]
struct Event {
  summary: Option<String>,
  status: Option<String>,
  start: Option<EventTime>,
  end: Option<EventTime>,
}

#[derive(Deserialize)]
struct EventsResponse {
  #[serde(default)]
  items: Vec<Event>,
}

pub fn events_to_items(body: &str) -> Result<Vec<RawItem>, GoogleError> {
  let parsed: EventsResponse = serde_json::from_str(body).map_err(unexpected)?;
  Ok(
    parsed
      .items
      .into_iter()
      .filter(|event| event.status.as_deref() != Some("cancelled"))
      .filter_map(|event| {
        let (start, end) = (event.start?, event.end?);
        let (start, end, all_day) = match (start.date_time, end.date_time, start.date, end.date) {
          (Some(s), Some(e), _, _) => (s, e, false),
          (_, _, Some(s), Some(e)) => (s, e, true),
          _ => return None,
        };
        let title = event
          .summary
          .filter(|t| !t.trim().is_empty())
          .unwrap_or_else(|| "(sem título)".to_owned());
        Some(RawItem { kind: "event".into(), title: Some(title), start, end, all_day })
      })
      .collect(),
  )
}

#[derive(Deserialize)]
struct BusyRange {
  start: String,
  end: String,
}

#[derive(Deserialize)]
struct BusyCalendar {
  #[serde(default)]
  busy: Vec<BusyRange>,
  #[serde(default)]
  errors: Vec<serde_json::Value>,
}

#[derive(Deserialize)]
struct FreeBusyResponse {
  #[serde(default)]
  calendars: HashMap<String, BusyCalendar>,
}

pub fn freebusy_to_items(body: &str) -> Result<Vec<RawItem>, GoogleError> {
  let parsed: FreeBusyResponse = serde_json::from_str(body).map_err(unexpected)?;
  let Some(calendar) = parsed.calendars.get("primary").or_else(|| parsed.calendars.values().next()) else {
    return Ok(Vec::new());
  };
  if !calendar.errors.is_empty() {
    return Err(GoogleError::Other("O Google não liberou a disponibilidade desta agenda.".into()));
  }
  Ok(
    calendar
      .busy
      .iter()
      .map(|range| RawItem {
        kind: "busy".into(),
        title: None,
        start: range.start.clone(),
        end: range.end.clone(),
        all_day: false,
      })
      .collect(),
  )
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `source "$HOME/.cargo/env" && cargo test --manifest-path src-tauri/Cargo.toml google`
Expected: todos os testes de `google::` passam. Avisos de `dead_code` para funções ainda não usadas são aceitáveis nesta tarefa (a Task 2 as usa); não os silencie com `allow` global.

- [ ] **Step 6: Job de CI do Rust**

Em `.github/workflows/ci.yml`, acrescente um segundo job ao lado de `check`:
```yaml
  rust:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - uses: dtolnay/rust-toolchain@stable
      - uses: swatinem/rust-cache@v2
        with:
          workspaces: "./src-tauri -> target"
      - run: cargo test --manifest-path src-tauri/Cargo.toml
```
O `pnpm build` vem antes porque o `tauri::generate_context!` embute a pasta `dist` na compilação.

- [ ] **Step 7: Verificar e commitar**

```bash
source "$HOME/.cargo/env" && cargo test --manifest-path src-tauri/Cargo.toml
pnpm test && pnpm typecheck && pnpm lint
git status   # src-tauri/.env não pode aparecer
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/build.rs src-tauri/.env.example src-tauri/src .gitignore .github/workflows/ci.yml
git commit -m "feat(google): erros, PKCE e conversões da API do Google em Rust, com CI do Rust"
```

---
### Task 2: Rust com I/O (Keychain, login OAuth, API e comandos)

**Files:**
- Create: `src-tauri/src/google/keychain.rs`, `src-tauri/src/google/oauth.rs`, `src-tauri/src/google/api.rs`, `src-tauri/src/google/commands.rs`
- Modify: `src-tauri/src/google/mod.rs`, `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: tudo da Task 1.
- Produces (comandos Tauri; nomes e argumentos exatos, chamados pelo JS com chaves camelCase):
  - `google_is_configured() -> bool`
  - `google_connect(mode: "details" | "busy") -> { email: string }` (erro: `GoogleError`)
  - `google_disconnect(email: string) -> ()`
  - `google_list_calendars(email: string) -> { id, name, primary }[]`
  - `google_fetch_day(accounts: { email, mode, calendarIds: string[] }[], dayStart: string, dayEnd: string) -> { email, items?: RawItem[], error?: GoogleError }[]` (nunca rejeita; o erro vai por conta)

- [ ] **Step 1: Implementar os módulos**

Esta tarefa é I/O (rede, Keychain, navegador) e não tem teste automatizado próprio; as partes puras já foram testadas na Task 1. A verificação é compilar e o teste manual da Task 8.

`src-tauri/src/google/mod.rs`:
```rust
//! Integração somente leitura com a Agenda do Google.

pub mod api;
pub mod commands;
pub mod errors;
pub mod keychain;
pub mod oauth;
pub mod parse;
pub mod pkce;
```

`src-tauri/src/google/keychain.rs`:
```rust
use super::errors::GoogleError;

const SERVICE: &str = "com.juannixx.kamban.google";

fn entry(email: &str) -> Result<keyring::Entry, GoogleError> {
  keyring::Entry::new(SERVICE, email).map_err(|e| GoogleError::Other(format!("Chaves do macOS: {e}")))
}

pub fn save(email: &str, refresh_token: &str) -> Result<(), GoogleError> {
  entry(email)?
    .set_password(refresh_token)
    .map_err(|e| GoogleError::Other(format!("Não foi possível guardar a permissão nas Chaves do macOS: {e}")))
}

pub fn load(email: &str) -> Result<Option<String>, GoogleError> {
  match entry(email)?.get_password() {
    Ok(token) => Ok(Some(token)),
    Err(keyring::Error::NoEntry) => Ok(None),
    Err(e) => Err(GoogleError::Other(format!("Não foi possível ler a permissão nas Chaves do macOS: {e}"))),
  }
}

pub fn delete(email: &str) -> Result<(), GoogleError> {
  match entry(email)?.delete_credential() {
    Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
    Err(e) => Err(GoogleError::Other(format!("Não foi possível apagar a permissão nas Chaves do macOS: {e}"))),
  }
}
```

`src-tauri/src/google/oauth.rs`:
```rust
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use url::Url;

use super::errors::{classify_oauth_error, from_reqwest, GoogleError};
use super::parse::{parse_callback, parse_token_response, Callback, TokenResponse};
use super::pkce::{challenge, random_token};

pub const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
pub const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
pub const REVOKE_URL: &str = "https://oauth2.googleapis.com/revoke";
const LOGIN_TIMEOUT: Duration = Duration::from_secs(300);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Mode {
  Details,
  Busy,
}

pub fn scopes(mode: Mode) -> &'static str {
  match mode {
    Mode::Details => "openid email https://www.googleapis.com/auth/calendar.readonly",
    Mode::Busy => "openid email https://www.googleapis.com/auth/calendar.freebusy",
  }
}

pub struct Client {
  pub id: &'static str,
  pub secret: &'static str,
}

/// Credencial "App para computador" embutida no build (ver build.rs).
pub fn client() -> Result<Client, GoogleError> {
  match (option_env!("GOOGLE_CLIENT_ID"), option_env!("GOOGLE_CLIENT_SECRET")) {
    (Some(id), Some(secret)) if !id.is_empty() && !secret.is_empty() => Ok(Client { id, secret }),
    _ => Err(GoogleError::NotConfigured),
  }
}

const PAGE_OK: &str = "<!doctype html><meta charset=utf-8><title>Kamban</title><body style=\"font-family:system-ui;padding:3rem\"><h1>Conta conectada</h1><p>Pode fechar esta aba e voltar ao Kamban.</p></body>";
const PAGE_ERROR: &str = "<!doctype html><meta charset=utf-8><title>Kamban</title><body style=\"font-family:system-ui;padding:3rem\"><h1>A conexão não foi concluída</h1><p>Volte ao Kamban para ver o motivo.</p></body>";

async fn respond(stream: &mut tokio::net::TcpStream, status: &str, body: &str) {
  let response = format!(
    "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
    body.len()
  );
  let _ = stream.write_all(response.as_bytes()).await;
  let _ = stream.shutdown().await;
}

async fn wait_for_callback(listener: &TcpListener) -> Result<Callback, GoogleError> {
  loop {
    let (mut stream, _) = listener
      .accept()
      .await
      .map_err(|e| GoogleError::Other(format!("Servidor local do login falhou: {e}")))?;
    let mut buf = vec![0u8; 8192];
    let read = stream.read(&mut buf).await.unwrap_or(0);
    let text = String::from_utf8_lossy(&buf[..read]);
    match parse_callback(text.lines().next().unwrap_or("")) {
      Some(callback) => {
        let page = if callback.error.is_some() { PAGE_ERROR } else { PAGE_OK };
        respond(&mut stream, "200 OK", page).await;
        return Ok(callback);
      }
      None => respond(&mut stream, "404 Not Found", "").await,
    }
  }
}

/// Fluxo OAuth para apps instalados: PKCE + retorno em 127.0.0.1 com porta aleatória.
pub async fn authorize(app: &AppHandle, http: &reqwest::Client, mode: Mode) -> Result<TokenResponse, GoogleError> {
  let client = client()?;
  let listener = TcpListener::bind("127.0.0.1:0")
    .await
    .map_err(|e| GoogleError::Other(format!("Não foi possível abrir o servidor local do login: {e}")))?;
  let port = listener
    .local_addr()
    .map_err(|e| GoogleError::Other(e.to_string()))?
    .port();
  let redirect_uri = format!("http://127.0.0.1:{port}");
  let verifier = random_token(32);
  let state = random_token(16);

  let mut url = Url::parse(AUTH_URL).expect("URL fixa válida");
  url
    .query_pairs_mut()
    .append_pair("client_id", client.id)
    .append_pair("redirect_uri", &redirect_uri)
    .append_pair("response_type", "code")
    .append_pair("scope", scopes(mode))
    .append_pair("code_challenge", &challenge(&verifier))
    .append_pair("code_challenge_method", "S256")
    .append_pair("state", &state)
    .append_pair("access_type", "offline")
    .append_pair("prompt", "consent select_account");
  app
    .opener()
    .open_url(url.as_str(), None::<&str>)
    .map_err(|e| GoogleError::Other(format!("Não foi possível abrir o navegador: {e}")))?;

  let callback = tokio::time::timeout(LOGIN_TIMEOUT, wait_for_callback(&listener))
    .await
    .map_err(|_| GoogleError::Timeout)??;
  if let Some(error) = callback.error {
    return Err(classify_oauth_error(&error));
  }
  if callback.state.as_deref() != Some(state.as_str()) {
    return Err(GoogleError::Other("Resposta de login inválida. Tente conectar de novo.".into()));
  }
  let code = callback
    .code
    .ok_or_else(|| GoogleError::Other("O Google não devolveu o código de autorização.".into()))?;

  let response = http
    .post(TOKEN_URL)
    .form(&[
      ("code", code.as_str()),
      ("client_id", client.id),
      ("client_secret", client.secret),
      ("redirect_uri", redirect_uri.as_str()),
      ("grant_type", "authorization_code"),
      ("code_verifier", verifier.as_str()),
    ])
    .send()
    .await
    .map_err(|e| from_reqwest(&e))?;
  let status = response.status().as_u16();
  let body = response.text().await.map_err(|e| from_reqwest(&e))?;
  parse_token_response(status, &body)
}
```

`src-tauri/src/google/api.rs`:
```rust
use std::collections::HashMap;
use std::time::{Duration, Instant};

use reqwest::StatusCode;
use tokio::sync::Mutex;
use url::Url;

use super::errors::{from_reqwest, GoogleError};
use super::keychain;
use super::oauth::{self, TOKEN_URL};
use super::parse::{calendar_list, events_to_items, freebusy_to_items, parse_token_response, CalendarInfo, RawItem};

const API: &str = "https://www.googleapis.com/calendar/v3";

/// Estado compartilhado dos comandos: cliente HTTP e tokens de acesso em memória (nunca em disco).
pub struct GoogleState {
  pub http: reqwest::Client,
  access: Mutex<HashMap<String, (String, Instant)>>,
}

impl GoogleState {
  pub fn new() -> Self {
    Self {
      http: reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .expect("cliente HTTP"),
      access: Mutex::new(HashMap::new()),
    }
  }

  pub async fn remember_access(&self, email: &str, token: String, expires_in: u64) {
    let expiry = Instant::now() + Duration::from_secs(expires_in.saturating_sub(60));
    self.access.lock().await.insert(email.to_owned(), (token, expiry));
  }

  pub async fn forget(&self, email: &str) {
    self.access.lock().await.remove(email);
  }

  async fn access_token(&self, email: &str) -> Result<String, GoogleError> {
    if let Some((token, expiry)) = self.access.lock().await.get(email) {
      if Instant::now() < *expiry {
        return Ok(token.clone());
      }
    }
    self.refresh_access(email).await
  }

  async fn refresh_access(&self, email: &str) -> Result<String, GoogleError> {
    let client = oauth::client()?;
    let refresh = keychain::load(email)?.ok_or(GoogleError::Revoked)?;
    let response = self
      .http
      .post(TOKEN_URL)
      .form(&[
        ("client_id", client.id),
        ("client_secret", client.secret),
        ("refresh_token", refresh.as_str()),
        ("grant_type", "refresh_token"),
      ])
      .send()
      .await
      .map_err(|e| from_reqwest(&e))?;
    let status = response.status().as_u16();
    let body = response.text().await.map_err(|e| from_reqwest(&e))?;
    let tokens = parse_token_response(status, &body)?;
    self.remember_access(email, tokens.access_token.clone(), tokens.expires_in).await;
    Ok(tokens.access_token)
  }

  /// Envia a requisição com o token de acesso; num 401 renova uma vez e repete.
  async fn send(
    &self,
    email: &str,
    build: impl Fn(&reqwest::Client, &str) -> reqwest::RequestBuilder,
  ) -> Result<String, GoogleError> {
    let mut token = self.access_token(email).await?;
    for attempt in 0..2 {
      let response = build(&self.http, &token).send().await.map_err(|e| from_reqwest(&e))?;
      let status = response.status();
      if status == StatusCode::UNAUTHORIZED {
        if attempt == 0 {
          self.forget(email).await;
          token = self.refresh_access(email).await?;
          continue;
        }
        return Err(GoogleError::Revoked);
      }
      let body = response.text().await.map_err(|e| from_reqwest(&e))?;
      if !status.is_success() {
        let snippet: String = body.chars().take(200).collect();
        return Err(GoogleError::Other(format!("O Google respondeu {}: {snippet}", status.as_u16())));
      }
      return Ok(body);
    }
    Err(GoogleError::Revoked)
  }

  pub async fn list_calendars(&self, email: &str) -> Result<Vec<CalendarInfo>, GoogleError> {
    let url = format!("{API}/users/me/calendarList?minAccessRole=reader&fields=items(id,summary,summaryOverride,primary)");
    let body = self.send(email, |http, token| http.get(&url).bearer_auth(token)).await?;
    calendar_list(&body)
  }

  pub async fn day_events(
    &self,
    email: &str,
    calendar_ids: &[String],
    day_start: &str,
    day_end: &str,
  ) -> Result<Vec<RawItem>, GoogleError> {
    let mut items = Vec::new();
    for calendar_id in calendar_ids {
      let mut url = Url::parse(&format!("{API}/calendars/")).expect("URL fixa válida");
      url
        .path_segments_mut()
        .expect("URL com caminho")
        .pop_if_empty()
        .push(calendar_id)
        .push("events");
      url
        .query_pairs_mut()
        .append_pair("timeMin", day_start)
        .append_pair("timeMax", day_end)
        .append_pair("singleEvents", "true")
        .append_pair("orderBy", "startTime")
        .append_pair("maxResults", "250")
        .append_pair("fields", "items(summary,status,start,end)");
      let body = self.send(email, |http, token| http.get(url.as_str()).bearer_auth(token)).await?;
      items.extend(events_to_items(&body)?);
    }
    Ok(items)
  }

  pub async fn day_busy(&self, email: &str, day_start: &str, day_end: &str) -> Result<Vec<RawItem>, GoogleError> {
    let payload = serde_json::json!({ "timeMin": day_start, "timeMax": day_end, "items": [{ "id": "primary" }] });
    let url = format!("{API}/freeBusy");
    let body = self
      .send(email, |http, token| http.post(&url).bearer_auth(token).json(&payload))
      .await?;
    freebusy_to_items(&body)
  }
}
```

`src-tauri/src/google/commands.rs`:
```rust
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

use super::api::GoogleState;
use super::errors::GoogleError;
use super::keychain;
use super::oauth::{self, Mode, REVOKE_URL};
use super::parse::{email_from_id_token, CalendarInfo, RawItem};

#[derive(Serialize)]
pub struct ConnectResult {
  pub email: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchRequest {
  pub email: String,
  pub mode: Mode,
  pub calendar_ids: Vec<String>,
}

#[derive(Serialize)]
pub struct FetchResult {
  pub email: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub items: Option<Vec<RawItem>>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub error: Option<GoogleError>,
}

#[tauri::command]
pub fn google_is_configured() -> bool {
  oauth::client().is_ok()
}

#[tauri::command]
pub async fn google_connect(app: AppHandle, state: State<'_, GoogleState>, mode: Mode) -> Result<ConnectResult, GoogleError> {
  let tokens = oauth::authorize(&app, &state.http, mode).await?;
  let email = tokens
    .id_token
    .as_deref()
    .and_then(email_from_id_token)
    .ok_or_else(|| GoogleError::Other("O Google não informou o e-mail da conta.".into()))?;
  let refresh = tokens
    .refresh_token
    .clone()
    .ok_or_else(|| GoogleError::Other("O Google não devolveu uma permissão permanente. Tente conectar de novo.".into()))?;
  keychain::save(&email, &refresh)?;
  state.remember_access(&email, tokens.access_token, tokens.expires_in).await;
  Ok(ConnectResult { email })
}

#[tauri::command]
pub async fn google_disconnect(state: State<'_, GoogleState>, email: String) -> Result<(), GoogleError> {
  if let Ok(Some(refresh)) = keychain::load(&email) {
    // Revogar no Google é cortesia: se falhar (sem rede), a permissão local é apagada do mesmo jeito.
    let _ = state.http.post(REVOKE_URL).form(&[("token", refresh.as_str())]).send().await;
  }
  state.forget(&email).await;
  keychain::delete(&email)
}

#[tauri::command]
pub async fn google_list_calendars(state: State<'_, GoogleState>, email: String) -> Result<Vec<CalendarInfo>, GoogleError> {
  state.list_calendars(&email).await
}

#[tauri::command]
pub async fn google_fetch_day(
  state: State<'_, GoogleState>,
  accounts: Vec<FetchRequest>,
  day_start: String,
  day_end: String,
) -> Result<Vec<FetchResult>, GoogleError> {
  let mut results = Vec::with_capacity(accounts.len());
  for account in accounts {
    let outcome = match account.mode {
      Mode::Details => state.day_events(&account.email, &account.calendar_ids, &day_start, &day_end).await,
      Mode::Busy => state.day_busy(&account.email, &day_start, &day_end).await,
    };
    results.push(match outcome {
      Ok(items) => FetchResult { email: account.email, items: Some(items), error: None },
      Err(error) => FetchResult { email: account.email, items: None, error: Some(error) },
    });
  }
  Ok(results)
}
```

- [ ] **Step 2: Registrar no `lib.rs`**

No `run()` de `src-tauri/src/lib.rs`, logo depois de `tauri::Builder::default()` e antes dos `.plugin(...)`, acrescente:
```rust
    .manage(google::api::GoogleState::new())
    .invoke_handler(tauri::generate_handler![
      google::commands::google_is_configured,
      google::commands::google_connect,
      google::commands::google_disconnect,
      google::commands::google_list_calendars,
      google::commands::google_fetch_day,
    ])
```
Comandos definidos pelo próprio app não precisam de permissão na capability.

- [ ] **Step 3: Compilar**

```bash
source "$HOME/.cargo/env" && cargo test --manifest-path src-tauri/Cargo.toml
source "$HOME/.cargo/env" && cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
source "$HOME/.cargo/env" && pnpm tauri build --debug --bundles app
```
Expected: testes da Task 1 passam, clippy sem avisos, `Kamban.app` gerado. Se o `clippy` não estiver instalado, rode `rustup component add clippy` antes. Se alguma API das crates divergir do código acima (por exemplo, nome de método do `keyring` 3 ou do `reqwest` 0.12), confira a assinatura real no código-fonte em `~/.cargo/registry/src/*/` e ajuste o mínimo, registrando no relatório.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat(google): login OAuth com PKCE, Keychain e comandos da agenda"
```

---
### Task 3: Regras da agenda no domínio

**Files:**
- Create: `src/domain/agenda.ts`
- Test: `src/domain/agenda.test.ts`

**Interfaces:**
- Consumes: `toISODate` (`domain/dates`).
- Produces:
  - `AGENDA_COLORS = ["sky", "violet", "emerald", "amber", "rose", "teal"] as const`, `type AgendaColor`
  - `accountModeSchema`, `type AccountMode = "details" | "busy"`
  - `calendarAccountSchema`, `type CalendarAccount = { id; email; mode; color: AgendaColor; calendars: { id; name; selected }[] }`
  - `agendaItemSchema`, `type AgendaItem = { kind: "event" | "busy"; title?: string; start: string; end: string; allDay: boolean }`
  - `agendaCacheSchema`, `type AgendaCache = { date: string; accounts: Record<string, { fetchedAt: string; items: AgendaItem[] }> }`
  - `parseCalendarAccounts(value: unknown): CalendarAccount[]` (inválido → `[]`), `parseAgendaCache(text: string): AgendaCache | null`
  - `nextColor(accounts): AgendaColor`
  - `toLocalIsoString(date: Date): string`, `dayBounds(isoDate: string): { start: string; end: string }`
  - `mergeBusy(items: readonly AgendaItem[]): AgendaItem[]`
  - `type AgendaRow = { key; accountId; accountEmail; color; kind; title; timeLabel; allDay; past }`
  - `buildAgenda(cache, accounts, today: string, now: Date): AgendaRow[]`

- [ ] **Step 1: Escrever o teste que falha**

`src/domain/agenda.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildAgenda,
  dayBounds,
  mergeBusy,
  nextColor,
  parseAgendaCache,
  parseCalendarAccounts,
  type AgendaCache,
  type AgendaItem,
  type CalendarAccount,
} from "./agenda";

const originalTz = process.env.TZ;
function useTimezone(tz: string) {
  beforeEach(() => {
    process.env.TZ = tz;
  });
  afterEach(() => {
    process.env.TZ = originalTz;
  });
}

const pessoal: CalendarAccount = {
  id: "a1",
  email: "pessoal@gmail.com",
  mode: "details",
  color: "sky",
  calendars: [{ id: "primary", name: "Pessoal", selected: true }],
};
const trabalho: CalendarAccount = { id: "a2", email: "voce@yousalaw.com", mode: "busy", color: "violet", calendars: [] };

const event = (title: string, start: string, end: string): AgendaItem => ({ kind: "event", title, start, end, allDay: false });
const busy = (start: string, end: string): AgendaItem => ({ kind: "busy", start, end, allDay: false });

describe("dayBounds", () => {
  describe("em São Paulo", () => {
    useTimezone("America/Sao_Paulo");
    it("vai da meia-noite local até a meia-noite seguinte", () => {
      expect(dayBounds("2026-09-24")).toEqual({ start: "2026-09-24T00:00:00-03:00", end: "2026-09-25T00:00:00-03:00" });
    });
  });

  describe("com horário de verão (Nova York)", () => {
    useTimezone("America/New_York");
    it("dia de 23 horas muda o deslocamento no fim", () => {
      expect(dayBounds("2026-03-08")).toEqual({ start: "2026-03-08T00:00:00-05:00", end: "2026-03-09T00:00:00-04:00" });
    });
  });
});

describe("mergeBusy", () => {
  it("une blocos que se tocam ou se sobrepõem e ignora eventos", () => {
    const merged = mergeBusy([
      busy("2026-09-24T14:00:00-03:00", "2026-09-24T15:00:00-03:00"),
      busy("2026-09-24T10:00:00-03:00", "2026-09-24T11:00:00-03:00"),
      busy("2026-09-24T11:00:00-03:00", "2026-09-24T11:30:00-03:00"),
      busy("2026-09-24T10:30:00-03:00", "2026-09-24T10:45:00-03:00"),
      event("Não entra", "2026-09-24T12:00:00-03:00", "2026-09-24T13:00:00-03:00"),
    ]);
    expect(merged.map((b) => [b.start, b.end])).toEqual([
      ["2026-09-24T10:00:00-03:00", "2026-09-24T11:30:00-03:00"],
      ["2026-09-24T14:00:00-03:00", "2026-09-24T15:00:00-03:00"],
    ]);
  });
});

describe("buildAgenda", () => {
  useTimezone("America/Sao_Paulo");

  const cache: AgendaCache = {
    date: "2026-09-24",
    accounts: {
      a1: {
        fetchedAt: "2026-09-24T09:12:00.000Z",
        items: [
          event("Jantar", "2026-09-24T19:00:00-03:00", "2026-09-24T21:00:00-03:00"),
          { kind: "event", title: "Aniversário", start: "2026-09-24", end: "2026-09-25", allDay: true },
          event("Dentista", "2026-09-24T08:30:00-03:00", "2026-09-24T09:30:00-03:00"),
          event("Plantão", "2026-09-23T22:00:00-03:00", "2026-09-24T01:00:00-03:00"),
          { kind: "event", start: "2026-09-24T16:00:00-03:00", end: "2026-09-24T16:30:00-03:00", allDay: false },
        ],
      },
      a2: {
        fetchedAt: "2026-09-24T09:12:00.000Z",
        items: [
          busy("2026-09-24T10:00:00-03:00", "2026-09-24T11:00:00-03:00"),
          busy("2026-09-24T11:00:00-03:00", "2026-09-24T11:30:00-03:00"),
          busy("2026-09-24T14:00:00-03:00", "2026-09-24T15:00:00-03:00"),
          busy("2026-09-24T22:00:00-03:00", "2026-09-25T00:00:00-03:00"),
        ],
      },
    },
  };
  const now = new Date("2026-09-24T12:00:00-03:00");

  it("ordena dia inteiro primeiro e depois por horário, com rótulos e passado", () => {
    const rows = buildAgenda(cache, [pessoal, trabalho], "2026-09-24", now);
    expect(rows.map((r) => [r.timeLabel, r.title, r.color, r.past])).toEqual([
      ["Dia todo", "Aniversário", "sky", false],
      ["23/09 22:00", "Plantão", "sky", true],
      ["08:30", "Dentista", "sky", true],
      ["10:00", "Ocupado (até 11:30)", "violet", true],
      ["14:00", "Ocupado (até 15:00)", "violet", false],
      ["16:00", "(sem título)", "sky", false],
      ["19:00", "Jantar", "sky", false],
      ["22:00", "Ocupado (até o fim do dia)", "violet", false],
    ]);
    expect(rows[3]).toMatchObject({ kind: "busy", accountId: "a2", accountEmail: "voce@yousalaw.com", allDay: false });
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });

  it("cache de outro dia, sem cache ou conta sem dados não mostram nada", () => {
    expect(buildAgenda({ ...cache, date: "2026-09-23" }, [pessoal], "2026-09-24", now)).toEqual([]);
    expect(buildAgenda(null, [pessoal], "2026-09-24", now)).toEqual([]);
    const outra: CalendarAccount = { ...pessoal, id: "a9" };
    expect(buildAgenda(cache, [outra], "2026-09-24", now)).toEqual([]);
  });

  it("só mostra contas que ainda estão conectadas", () => {
    const rows = buildAgenda(cache, [trabalho], "2026-09-24", now);
    expect(rows.every((r) => r.accountId === "a2")).toBe(true);
  });
});

describe("parsers e cores", () => {
  it("parseAgendaCache aceita cache válido e recusa o resto", () => {
    const valid: AgendaCache = { date: "2026-09-24", accounts: {} };
    expect(parseAgendaCache(JSON.stringify(valid))).toEqual(valid);
    expect(parseAgendaCache("{")).toBeNull();
    expect(parseAgendaCache(JSON.stringify({ date: "24/09" }))).toBeNull();
  });

  it("parseCalendarAccounts devolve lista vazia para dado inválido", () => {
    expect(parseCalendarAccounts([pessoal])).toEqual([pessoal]);
    expect(parseCalendarAccounts(undefined)).toEqual([]);
    expect(parseCalendarAccounts([{ email: "x" }])).toEqual([]);
  });

  it("nextColor usa a primeira cor livre", () => {
    expect(nextColor([])).toBe("sky");
    expect(nextColor([pessoal])).toBe("violet");
    expect(nextColor([pessoal, trabalho])).toBe("emerald");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/domain/agenda.test.ts`
Expected: FAIL, `Failed to resolve import "./agenda"`

- [ ] **Step 3: Implementar**

`src/domain/agenda.ts`:
```ts
import { z } from "zod";
import { toISODate } from "./dates";

export const AGENDA_COLORS = ["sky", "violet", "emerald", "amber", "rose", "teal"] as const;
export type AgendaColor = (typeof AGENDA_COLORS)[number];

export const accountModeSchema = z.enum(["details", "busy"]);
export type AccountMode = z.infer<typeof accountModeSchema>;

export const calendarAccountSchema = z.object({
  id: z.string().min(1),
  email: z.string().min(1),
  mode: accountModeSchema,
  color: z.enum(AGENDA_COLORS),
  calendars: z.array(z.object({ id: z.string().min(1), name: z.string(), selected: z.boolean() })),
});
export type CalendarAccount = z.infer<typeof calendarAccountSchema>;

export const agendaItemSchema = z.object({
  kind: z.enum(["event", "busy"]),
  title: z.string().optional(),
  start: z.string().min(1),
  end: z.string().min(1),
  allDay: z.boolean(),
});
export type AgendaItem = z.infer<typeof agendaItemSchema>;

export const agendaCacheSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  accounts: z.record(z.string(), z.object({ fetchedAt: z.string(), items: z.array(agendaItemSchema) })),
});
export type AgendaCache = z.infer<typeof agendaCacheSchema>;

export function parseCalendarAccounts(value: unknown): CalendarAccount[] {
  const result = z.array(calendarAccountSchema).safeParse(value);
  return result.success ? result.data : [];
}

export function parseAgendaCache(text: string): AgendaCache | null {
  try {
    const result = agendaCacheSchema.safeParse(JSON.parse(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function nextColor(accounts: readonly CalendarAccount[]): AgendaColor {
  const used = new Set(accounts.map((a) => a.color));
  return AGENDA_COLORS.find((c) => !used.has(c)) ?? AGENDA_COLORS[accounts.length % AGENDA_COLORS.length] ?? "sky";
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Data em ISO 8601 no horário local, com o deslocamento do fuso (ex.: 2026-09-24T00:00:00-03:00). */
export function toLocalIsoString(date: Date): string {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return `${day}T${time}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** Limites do dia local: da meia-noite de `isoDate` até a meia-noite seguinte. */
export function dayBounds(isoDate: string): { start: string; end: string } {
  const [y = 0, m = 1, d = 1] = isoDate.split("-").map(Number);
  return { start: toLocalIsoString(new Date(y, m - 1, d)), end: toLocalIsoString(new Date(y, m - 1, d + 1)) };
}

/** Une blocos "busy" que se tocam ou se sobrepõem. Eventos são ignorados. */
export function mergeBusy(items: readonly AgendaItem[]): AgendaItem[] {
  const sorted = items.filter((i) => i.kind === "busy").sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const merged: AgendaItem[] = [];
  for (const item of sorted) {
    const last = merged.at(-1);
    if (last && Date.parse(item.start) <= Date.parse(last.end)) {
      if (Date.parse(item.end) > Date.parse(last.end)) merged[merged.length - 1] = { ...last, end: item.end };
    } else {
      merged.push({ ...item });
    }
  }
  return merged;
}

export interface AgendaRow {
  key: string;
  accountId: string;
  accountEmail: string;
  color: AgendaColor;
  kind: "event" | "busy";
  title: string;
  timeLabel: string;
  allDay: boolean;
  past: boolean;
}

const formatTime = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
const formatDayMonth = (date: Date) => `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;

/** Linhas da seção Agenda da tela Hoje, já ordenadas. */
export function buildAgenda(
  cache: AgendaCache | null,
  accounts: readonly CalendarAccount[],
  today: string,
  now: Date,
): AgendaRow[] {
  if (!cache || cache.date !== today) return [];
  const dayEnd = Date.parse(dayBounds(today).end);
  const rows: { row: AgendaRow; start: number; end: number; accountIndex: number }[] = [];

  accounts.forEach((account, accountIndex) => {
    const entry = cache.accounts[account.id];
    if (!entry) return;
    const items = [...entry.items.filter((i) => i.kind === "event"), ...mergeBusy(entry.items)];
    items.forEach((item, index) => {
      const key = `${account.id}:${item.kind}:${item.start}:${index}`;
      const base = { key, accountId: account.id, accountEmail: account.email, color: account.color, kind: item.kind };
      if (item.allDay) {
        rows.push({
          row: { ...base, title: item.title ?? "(sem título)", timeLabel: "Dia todo", allDay: true, past: false },
          start: Number.NEGATIVE_INFINITY,
          end: Number.NEGATIVE_INFINITY,
          accountIndex,
        });
        return;
      }
      const start = new Date(item.start);
      const end = new Date(item.end);
      const timeLabel = toISODate(start) === today ? formatTime(start) : `${formatDayMonth(start)} ${formatTime(start)}`;
      const title =
        item.kind === "busy"
          ? `Ocupado (até ${end.getTime() >= dayEnd ? "o fim do dia" : formatTime(end)})`
          : (item.title ?? "(sem título)");
      rows.push({
        row: { ...base, title, timeLabel, allDay: false, past: end.getTime() <= now.getTime() },
        start: start.getTime(),
        end: end.getTime(),
        accountIndex,
      });
    });
  });

  rows.sort((a, b) => {
    if (a.row.allDay !== b.row.allDay) return a.row.allDay ? -1 : 1;
    if (a.row.allDay) return a.row.title.localeCompare(b.row.title, "pt-BR") || a.accountIndex - b.accountIndex;
    return a.start - b.start || a.end - b.end || a.accountIndex - b.accountIndex;
  });
  return rows.map((r) => r.row);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test src/domain && pnpm typecheck && pnpm lint`
Expected: todos passam. Se a troca de `process.env.TZ` durante o teste não tiver efeito no seu ambiente (os horários saírem no fuso da máquina), pare e reporte NEEDS_CONTEXT com a saída: não troque as expectativas.

- [ ] **Step 5: Commit**

```bash
git add src/domain/agenda.ts src/domain/agenda.test.ts
git commit -m "feat(domain): regras da agenda (limites do dia, blocos ocupados, ordem e rótulos)"
```

---

### Task 4: Store da agenda e cache em arquivo

**Files:**
- Create: `src/store/agendaStore.ts`, `src/store/agendaCache.ts`
- Modify: `src/store/testing.ts`
- Test: `src/store/agendaStore.test.ts`, `src/store/agendaCache.test.ts`

**Interfaces:**
- Consumes: tudo da Task 3; `Clock` (`store/appStore`); `FileSystem`, `joinPath` (`persistence/fs`); `MemoryFs`.
- Produces (em `agendaStore.ts`):
  - `type AgendaErrorKind = "notConfigured" | "offline" | "revoked" | "adminBlocked" | "cancelled" | "timeout" | "other"`, `interface AgendaError { kind; message? }`, `toAgendaError(error: unknown): AgendaError`, `connectErrorMessage(error: AgendaError): string | null`
  - `interface CalendarInfo { id; name; primary }`, `interface FetchRequest { email; mode; calendarIds: string[] }`, `interface FetchResult { email; items?: AgendaItem[]; error?: AgendaError }`
  - `interface CalendarService { isConfigured(); connect(mode): Promise<string>; disconnect(email); listCalendars(email); fetchDay(requests, dayStart, dayEnd) }`
  - `interface AgendaSettings { getCalendarAccounts(): Promise<CalendarAccount[]>; setCalendarAccounts(accounts): Promise<void> }`
  - `interface AgendaCacheStore { read(): Promise<AgendaCache | null>; write(cache): Promise<void> }` (nunca rejeitam)
  - `type AccountStatus = "ok" | "offline" | "revoked"`
  - `AgendaState { ready; configured; accounts; cache; status: Record<string, AccountStatus>; lastRefreshAt: string | null; refreshing; connecting; message: string | null; now: string; today: string }`
  - `AgendaActions { init(); refresh(); refreshIfOlderThan(ms); tick(); connect(mode); disconnect(accountId); toggleCalendar(accountId, calendarId); setColor(accountId, color); dismissMessage() }`
  - `type AgendaStoreState`, `type AgendaStore`, `STALE_AFTER_MS = 15 * 60_000`, `createAgendaStore(deps: { service; settings; cache; clock: Pick<Clock, "now" | "today" | "newId">; staleAfterMs? })`
- Produces (em `agendaCache.ts`): `AGENDA_CACHE_FILE = "calendar-cache.json"`, `createFileAgendaCache(fs: FileSystem, dir: string): AgendaCacheStore`
- Produces (em `testing.ts`): `fakeClock` ganha `setNow(iso: string | null)`; `memorySettings(initialDir?, initialAccounts?)` passa a implementar também `AgendaSettings` e expõe `accounts`; `fakeCalendarService(overrides?)` (todas as funções `vi.fn`; por padrão configurado, `connect` devolve `"pessoal@gmail.com"`, `listCalendars` devolve `[{ id: "primary", name: "Pessoal", primary: true }]`, `fetchDay` devolve `items: []` para cada conta); `memoryAgendaCache(initial?)` com `current`.

- [ ] **Step 1: Atualizar os helpers de teste**

`src/store/testing.ts` (substitui o arquivo inteiro; `fakeClock` e `memorySettings` continuam compatíveis com os usos atuais):
```ts
import { vi } from "vitest";
import type { AgendaCache, CalendarAccount } from "../domain/agenda";
import type { AgendaCacheStore, AgendaSettings, CalendarService } from "./agendaStore";
import type { Clock, Settings } from "./appStore";

export function fakeClock(start = "2026-09-23"): Clock & { setToday(value: string): void; setNow(value: string | null): void } {
  let today = start;
  let nowOverride: string | null = null;
  let counter = 0;
  return {
    now: () => nowOverride ?? `${today}T12:00:00.000Z`,
    today: () => today,
    stamp: () => `${today}T12-00-00Z`,
    newId: () => `id-${++counter}`,
    setToday(value: string) {
      today = value;
    },
    setNow(value: string | null) {
      nowOverride = value;
    },
  };
}

export function memorySettings(
  initial: string | null = null,
  initialAccounts: CalendarAccount[] = [],
): Settings & AgendaSettings & { readonly current: string | null; readonly accounts: CalendarAccount[] } {
  let dir = initial;
  let accounts = initialAccounts;
  return {
    getDataDir: async () => dir,
    setDataDir: async (value: string) => {
      dir = value;
    },
    getCalendarAccounts: async () => accounts,
    setCalendarAccounts: async (value: CalendarAccount[]) => {
      accounts = value;
    },
    get current() {
      return dir;
    },
    get accounts() {
      return accounts;
    },
  };
}

export function fakeCalendarService(overrides: Partial<CalendarService> = {}): CalendarService {
  return {
    isConfigured: vi.fn(async () => true),
    connect: vi.fn(async () => "pessoal@gmail.com"),
    disconnect: vi.fn(async () => {}),
    listCalendars: vi.fn(async () => [{ id: "primary", name: "Pessoal", primary: true }]),
    fetchDay: vi.fn(async (requests) => requests.map((r) => ({ email: r.email, items: [] }))),
    ...overrides,
  };
}

export function memoryAgendaCache(initial: AgendaCache | null = null): AgendaCacheStore & { readonly current: AgendaCache | null } {
  let cache = initial;
  return {
    read: async () => cache,
    write: async (value: AgendaCache) => {
      cache = value;
    },
    get current() {
      return cache;
    },
  };
}
```

- [ ] **Step 2: Escrever os testes que falham**

`src/store/agendaCache.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgendaCache } from "../domain/agenda";
import { MemoryFs } from "../persistence/memoryFs";
import { createFileAgendaCache } from "./agendaCache";

const cache: AgendaCache = {
  date: "2026-09-24",
  accounts: { a1: { fetchedAt: "2026-09-24T09:00:00.000Z", items: [] } },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createFileAgendaCache", () => {
  it("grava e lê de volta, criando a pasta", async () => {
    const fs = new MemoryFs();
    const store = createFileAgendaCache(fs, "/cache/kamban");
    expect(await store.read()).toBeNull();
    await store.write(cache);
    expect(await fs.exists("/cache/kamban")).toBe(true);
    expect(await store.read()).toEqual(cache);
  });

  it("arquivo inválido vira null", async () => {
    const fs = new MemoryFs();
    await fs.writeText("/cache/calendar-cache.json", "{ quebrado");
    expect(await createFileAgendaCache(fs, "/cache").read()).toBeNull();
  });

  it("falha ao gravar não lança erro", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fs = new MemoryFs();
    fs.failWrites = true;
    await expect(createFileAgendaCache(fs, "/cache").write(cache)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
  });
});
```

`src/store/agendaStore.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { dayBounds, type AgendaCache, type CalendarAccount } from "../domain/agenda";
import { createAgendaStore, type CalendarService, type FetchRequest } from "./agendaStore";
import { fakeCalendarService, fakeClock, memoryAgendaCache, memorySettings } from "./testing";

const TODAY = "2026-09-24";
const pessoal: CalendarAccount = {
  id: "a1",
  email: "pessoal@gmail.com",
  mode: "details",
  color: "sky",
  calendars: [
    { id: "primary", name: "Pessoal", selected: true },
    { id: "feriados", name: "Feriados", selected: false },
  ],
};
const trabalho: CalendarAccount = { id: "a2", email: "voce@yousalaw.com", mode: "busy", color: "violet", calendars: [] };
const dentista = { kind: "event" as const, title: "Dentista", start: "2026-09-24T08:30:00-03:00", end: "2026-09-24T09:30:00-03:00", allDay: false };
const ocupado = { kind: "busy" as const, start: "2026-09-24T10:00:00-03:00", end: "2026-09-24T11:00:00-03:00", allDay: false };

function setup(options: { accounts?: CalendarAccount[]; cache?: AgendaCache | null; service?: Partial<CalendarService> } = {}) {
  const clock = fakeClock(TODAY);
  const settings = memorySettings(null, options.accounts ?? []);
  const cache = memoryAgendaCache(options.cache ?? null);
  const service = fakeCalendarService(options.service);
  const store = createAgendaStore({ service, settings, cache, clock });
  return { clock, settings, cache, service, store, state: () => store.getState() };
}

describe("init e refresh", () => {
  it("sem contas fica pronto e não chama o Google", async () => {
    const { service, state } = await setup();
    await state().init();
    expect(state()).toMatchObject({ ready: true, configured: true, accounts: [] });
    expect(service.fetchDay).not.toHaveBeenCalled();
  });

  it("busca o dia de todas as contas e grava o cache", async () => {
    const fetchDay = vi.fn(async (requests: FetchRequest[]) =>
      requests.map((r) => ({ email: r.email, items: r.mode === "busy" ? [ocupado] : [dentista] })),
    );
    const { cache, state } = setup({ accounts: [pessoal, trabalho], service: { fetchDay } });
    await state().init();
    const { start, end } = dayBounds(TODAY);
    expect(fetchDay).toHaveBeenCalledWith(
      [
        { email: "pessoal@gmail.com", mode: "details", calendarIds: ["primary"] },
        { email: "voce@yousalaw.com", mode: "busy", calendarIds: ["primary"] },
      ],
      start,
      end,
    );
    expect(cache.current?.date).toBe(TODAY);
    expect(cache.current?.accounts.a1?.items).toEqual([dentista]);
    expect(cache.current?.accounts.a2?.items).toEqual([ocupado]);
    expect(state().status).toEqual({ a1: "ok", a2: "ok" });
    expect(state().lastRefreshAt).toBe(`${TODAY}T12:00:00.000Z`);
  });

  it("erro de uma conta não afeta a outra e mantém o cache da que falhou", async () => {
    const previous: AgendaCache = { date: TODAY, accounts: { a2: { fetchedAt: "2026-09-24T08:00:00.000Z", items: [ocupado] } } };
    const fetchDay = vi.fn(async () => [
      { email: "pessoal@gmail.com", items: [dentista] },
      { email: "voce@yousalaw.com", error: { kind: "offline" as const, message: "sem rede" } },
    ]);
    const { cache, state } = setup({ accounts: [pessoal, trabalho], cache: previous, service: { fetchDay } });
    await state().init();
    expect(state().status).toEqual({ a1: "ok", a2: "offline" });
    expect(cache.current?.accounts.a2).toEqual(previous.accounts.a2);
    expect(cache.current?.accounts.a1?.items).toEqual([dentista]);
  });

  it("permissão revogada tira a conta do cache e marca 'revoked'", async () => {
    const previous: AgendaCache = { date: TODAY, accounts: { a1: { fetchedAt: "x", items: [dentista] } } };
    const fetchDay = vi.fn(async () => [{ email: "pessoal@gmail.com", error: { kind: "revoked" as const } }]);
    const { cache, state } = setup({ accounts: [pessoal], cache: previous, service: { fetchDay } });
    await state().init();
    expect(state().status).toEqual({ a1: "revoked" });
    expect(cache.current?.accounts.a1).toBeUndefined();
  });

  it("falha inesperada do serviço marca todas como sem conexão", async () => {
    const fetchDay = vi.fn(async () => {
      throw new Error("ipc caiu");
    });
    const { state } = setup({ accounts: [pessoal, trabalho], service: { fetchDay } });
    await state().init();
    expect(state().status).toEqual({ a1: "offline", a2: "offline" });
  });

  it("cache de outro dia é ignorado e a virada do dia busca o novo dia", async () => {
    const old: AgendaCache = { date: "2026-09-23", accounts: { a1: { fetchedAt: "x", items: [dentista] } } };
    const { clock, service, cache, state } = setup({ accounts: [pessoal], cache: old });
    await state().init();
    expect(cache.current?.date).toBe(TODAY);
    clock.setToday("2026-09-25");
    await state().tick();
    expect(service.fetchDay).toHaveBeenCalledTimes(2);
    expect(vi.mocked(service.fetchDay).mock.calls[1]?.[1]).toBe(dayBounds("2026-09-25").start);
    expect(cache.current?.date).toBe("2026-09-25");
  });

  it("refreshIfOlderThan respeita o intervalo", async () => {
    const { clock, service, state } = setup({ accounts: [pessoal] });
    await state().init();
    clock.setNow(`${TODAY}T12:00:30.000Z`);
    await state().refreshIfOlderThan(60_000);
    expect(service.fetchDay).toHaveBeenCalledTimes(1);
    clock.setNow(`${TODAY}T12:01:00.000Z`);
    await state().refreshIfOlderThan(60_000);
    expect(service.fetchDay).toHaveBeenCalledTimes(2);
  });

  it("não roda duas atualizações ao mesmo tempo, mas repete uma vez se pedirem durante", async () => {
    let release: () => void = () => {};
    const fetchDay = vi.fn(
      (requests: FetchRequest[]) =>
        new Promise<{ email: string; items: never[] }[]>((resolve) => {
          release = () => resolve(requests.map((r) => ({ email: r.email, items: [] })));
        }),
    );
    const { state } = setup({ accounts: [pessoal], service: { fetchDay } });
    const first = state().refresh();
    void state().refresh();
    void state().refresh();
    release();
    await vi.waitFor(() => expect(fetchDay).toHaveBeenCalledTimes(2));
    release();
    await first;
    await vi.waitFor(() => expect(state().refreshing).toBe(false));
    expect(fetchDay).toHaveBeenCalledTimes(2);
  });
});

describe("contas", () => {
  it("conectar com detalhes lista as agendas, marca a principal e atualiza", async () => {
    const listCalendars = vi.fn(async () => [
      { id: "primary", name: "Pessoal", primary: true },
      { id: "familia", name: "Família", primary: false },
    ]);
    const { settings, service, state } = setup({ service: { listCalendars } });
    await state().init();
    await state().connect("details");
    expect(service.connect).toHaveBeenCalledWith("details");
    expect(settings.accounts).toEqual([
      {
        id: "id-1",
        email: "pessoal@gmail.com",
        mode: "details",
        color: "sky",
        calendars: [
          { id: "primary", name: "Pessoal", selected: true },
          { id: "familia", name: "Família", selected: false },
        ],
      },
    ]);
    expect(service.fetchDay).toHaveBeenCalledOnce();
    expect(state().connecting).toBe(false);
  });

  it("conectar só horários não lista agendas", async () => {
    const connect = vi.fn(async () => "voce@yousalaw.com");
    const { settings, service, state } = setup({ service: { connect } });
    await state().init();
    await state().connect("busy");
    expect(service.listCalendars).not.toHaveBeenCalled();
    expect(settings.accounts[0]).toMatchObject({ email: "voce@yousalaw.com", mode: "busy", calendars: [] });
  });

  it("conectar de novo a mesma conta substitui, mantendo id e cor", async () => {
    const { settings, state } = setup({ accounts: [{ ...pessoal, color: "rose" }] });
    await state().init();
    await state().connect("busy");
    expect(settings.accounts).toHaveLength(1);
    expect(settings.accounts[0]).toMatchObject({ id: "a1", color: "rose", mode: "busy" });
  });

  it("erros ao conectar viram mensagem, e cancelar não mostra nada", async () => {
    const connect = vi.fn();
    const { state } = setup({ service: { connect } });
    await state().init();
    connect.mockRejectedValueOnce({ kind: "adminBlocked" });
    await state().connect("busy");
    expect(state().message).toBe("O administrador da conta bloqueou este app. Peça à TI para liberar o Kamban.");
    connect.mockRejectedValueOnce({ kind: "cancelled" });
    await state().connect("busy");
    expect(state().message).toBeNull();
    connect.mockRejectedValueOnce(new Error("estranho"));
    await state().connect("busy");
    expect(state().message).toBe("Não foi possível conectar: estranho");
  });

  it("desconectar apaga a permissão, a conta e o cache dela", async () => {
    const previous: AgendaCache = { date: TODAY, accounts: { a1: { fetchedAt: "x", items: [dentista] }, a2: { fetchedAt: "x", items: [ocupado] } } };
    const { settings, cache, service, state } = setup({ accounts: [pessoal, trabalho], cache: previous });
    await state().init();
    await state().disconnect("a1");
    expect(service.disconnect).toHaveBeenCalledWith("pessoal@gmail.com");
    expect(settings.accounts.map((a) => a.id)).toEqual(["a2"]);
    expect(cache.current?.accounts.a1).toBeUndefined();
    expect(state().status.a1).toBeUndefined();
  });

  it("marcar agenda grava e atualiza com as agendas escolhidas", async () => {
    const { settings, service, state } = setup({ accounts: [pessoal] });
    await state().init();
    await state().toggleCalendar("a1", "feriados");
    expect(settings.accounts[0]?.calendars.map((c) => c.selected)).toEqual([true, true]);
    expect(vi.mocked(service.fetchDay).mock.calls.at(-1)?.[0]).toEqual([
      { email: "pessoal@gmail.com", mode: "details", calendarIds: ["primary", "feriados"] },
    ]);
  });

  it("trocar a cor grava", async () => {
    const { settings, state } = setup({ accounts: [pessoal] });
    await state().init();
    await state().setColor("a1", "amber");
    expect(settings.accounts[0]?.color).toBe("amber");
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm test src/store/agendaStore.test.ts src/store/agendaCache.test.ts`
Expected: FAIL, imports `./agendaStore` e `./agendaCache` não resolvidos.

- [ ] **Step 4: Implementar**

`src/store/agendaCache.ts`:
```ts
import { parseAgendaCache, type AgendaCache } from "../domain/agenda";
import { joinPath, type FileSystem } from "../persistence/fs";
import type { AgendaCacheStore } from "./agendaStore";

export const AGENDA_CACHE_FILE = "calendar-cache.json";

/** Cache descartável dos eventos do dia. Nunca lança erro: sem cache, a agenda só espera a próxima atualização. */
export function createFileAgendaCache(fs: FileSystem, dir: string): AgendaCacheStore {
  const path = joinPath(dir, AGENDA_CACHE_FILE);
  return {
    async read() {
      try {
        if (!(await fs.exists(path))) return null;
        return parseAgendaCache(await fs.readText(path));
      } catch (error) {
        console.warn("Cache da agenda ilegível", error);
        return null;
      }
    },
    async write(cache: AgendaCache) {
      try {
        await fs.mkdir(dir);
        await fs.writeText(path, JSON.stringify(cache));
      } catch (error) {
        console.warn("Não foi possível gravar o cache da agenda", error);
      }
    },
  };
}
```

`src/store/agendaStore.ts`:
```ts
import { createStore, type StoreApi } from "zustand/vanilla";
import {
  dayBounds,
  nextColor,
  type AccountMode,
  type AgendaCache,
  type AgendaColor,
  type AgendaItem,
  type CalendarAccount,
} from "../domain/agenda";
import type { Clock } from "./appStore";

export type AgendaErrorKind = "notConfigured" | "offline" | "revoked" | "adminBlocked" | "cancelled" | "timeout" | "other";

export interface AgendaError {
  kind: AgendaErrorKind;
  message?: string;
}

const ERROR_KINDS: readonly string[] = ["notConfigured", "offline", "revoked", "adminBlocked", "cancelled", "timeout", "other"];

/** Converte o erro que chega do Rust ({ kind, message? }) ou qualquer outra falha. */
export function toAgendaError(error: unknown): AgendaError {
  if (typeof error === "object" && error !== null && "kind" in error && typeof error.kind === "string" && ERROR_KINDS.includes(error.kind)) {
    const message = "message" in error && typeof error.message === "string" ? error.message : undefined;
    return { kind: error.kind as AgendaErrorKind, ...(message !== undefined ? { message } : {}) };
  }
  return { kind: "other", message: error instanceof Error ? error.message : String(error) };
}

export function connectErrorMessage(error: AgendaError): string | null {
  switch (error.kind) {
    case "cancelled":
    case "timeout":
      return null;
    case "adminBlocked":
      return "O administrador da conta bloqueou este app. Peça à TI para liberar o Kamban.";
    case "notConfigured":
      return "Integração com o Google não configurada neste build.";
    case "offline":
      return "Sem conexão com o Google. Tente de novo.";
    case "revoked":
    case "other":
      return `Não foi possível conectar: ${error.message ?? "erro desconhecido"}`;
  }
}

export interface CalendarInfo {
  id: string;
  name: string;
  primary: boolean;
}

export interface FetchRequest {
  email: string;
  mode: AccountMode;
  calendarIds: string[];
}

export interface FetchResult {
  email: string;
  items?: AgendaItem[];
  error?: AgendaError;
}

export interface CalendarService {
  isConfigured(): Promise<boolean>;
  /** Abre o navegador para autorizar e devolve o e-mail. Rejeita com AgendaError. */
  connect(mode: AccountMode): Promise<string>;
  disconnect(email: string): Promise<void>;
  listCalendars(email: string): Promise<CalendarInfo[]>;
  /** O erro de cada conta vem no próprio FetchResult. */
  fetchDay(requests: FetchRequest[], dayStart: string, dayEnd: string): Promise<FetchResult[]>;
}

export interface AgendaSettings {
  getCalendarAccounts(): Promise<CalendarAccount[]>;
  setCalendarAccounts(accounts: CalendarAccount[]): Promise<void>;
}

/** read/write nunca rejeitam. */
export interface AgendaCacheStore {
  read(): Promise<AgendaCache | null>;
  write(cache: AgendaCache): Promise<void>;
}

export type AccountStatus = "ok" | "offline" | "revoked";

export interface AgendaDeps {
  service: CalendarService;
  settings: AgendaSettings;
  cache: AgendaCacheStore;
  clock: Pick<Clock, "now" | "today" | "newId">;
  staleAfterMs?: number;
}

export interface AgendaState {
  ready: boolean;
  configured: boolean;
  accounts: CalendarAccount[];
  cache: AgendaCache | null;
  status: Record<string, AccountStatus>;
  lastRefreshAt: string | null;
  refreshing: boolean;
  connecting: boolean;
  message: string | null;
  now: string;
  today: string;
}

export interface AgendaActions {
  init(): Promise<void>;
  refresh(): Promise<void>;
  refreshIfOlderThan(ms: number): Promise<void>;
  /** Chamado a cada minuto: busca de novo na virada do dia ou quando os dados passam de 15 min. */
  tick(): Promise<void>;
  connect(mode: AccountMode): Promise<void>;
  disconnect(accountId: string): Promise<void>;
  toggleCalendar(accountId: string, calendarId: string): Promise<void>;
  setColor(accountId: string, color: AgendaColor): Promise<void>;
  dismissMessage(): void;
}

export type AgendaStoreState = AgendaState & AgendaActions;
export type AgendaStore = StoreApi<AgendaStoreState>;

export const STALE_AFTER_MS = 15 * 60_000;

function requestFor(account: CalendarAccount): FetchRequest {
  return {
    email: account.email,
    mode: account.mode,
    calendarIds: account.mode === "details" ? account.calendars.filter((c) => c.selected).map((c) => c.id) : ["primary"],
  };
}

export function createAgendaStore(deps: AgendaDeps): AgendaStore {
  const { service, settings, clock } = deps;
  const staleAfterMs = deps.staleAfterMs ?? STALE_AFTER_MS;
  let refreshAgain = false;

  return createStore<AgendaStoreState>()((set, get) => {
    async function saveAccounts(accounts: CalendarAccount[]) {
      set({ accounts });
      try {
        await settings.setCalendarAccounts(accounts);
      } catch (error) {
        set({ message: `Não foi possível salvar as contas da agenda: ${String(error)}` });
      }
    }

    async function saveCache(cache: AgendaCache) {
      set({ cache });
      await deps.cache.write(cache);
    }

    return {
      ready: false,
      configured: false,
      accounts: [],
      cache: null,
      status: {},
      lastRefreshAt: null,
      refreshing: false,
      connecting: false,
      message: null,
      now: clock.now(),
      today: clock.today(),

      async init() {
        const [configured, accounts, cache] = await Promise.all([
          service.isConfigured().catch(() => false),
          settings.getCalendarAccounts().catch(() => [] as CalendarAccount[]),
          deps.cache.read(),
        ]);
        const today = clock.today();
        set({ ready: true, configured, accounts, cache: cache?.date === today ? cache : null, today, now: clock.now() });
        await get().refresh();
      },

      async refresh() {
        if (get().refreshing) {
          refreshAgain = true;
          return;
        }
        const today = clock.today();
        set({ now: clock.now(), today });
        const requested = get().accounts;
        if (requested.length === 0) return;
        set({ refreshing: true });
        try {
          const { start, end } = dayBounds(today);
          let results: FetchResult[];
          try {
            results = await service.fetchDay(requested.map(requestFor), start, end);
          } catch (error) {
            const failure = toAgendaError(error);
            results = requested.map((a) => ({ email: a.email, error: failure }));
          }
          const current = get().cache;
          const entries = { ...(current?.date === today ? current.accounts : {}) };
          const status = { ...get().status };
          const fetchedAt = clock.now();
          const present = get().accounts;
          for (const account of present) {
            const result = results.find((r) => r.email === account.email);
            if (!result) continue;
            if (result.items) {
              entries[account.id] = { fetchedAt, items: result.items };
              status[account.id] = "ok";
            } else if (result.error?.kind === "revoked") {
              delete entries[account.id];
              status[account.id] = "revoked";
            } else {
              status[account.id] = "offline";
            }
          }
          const ids = new Set(present.map((a) => a.id));
          for (const id of Object.keys(entries)) if (!ids.has(id)) delete entries[id];
          for (const id of Object.keys(status)) if (!ids.has(id)) delete status[id];
          await saveCache({ date: today, accounts: entries });
          set({ status, lastRefreshAt: fetchedAt, now: fetchedAt });
        } finally {
          set({ refreshing: false });
          if (refreshAgain) {
            refreshAgain = false;
            await get().refresh();
          }
        }
      },

      async refreshIfOlderThan(ms) {
        const last = get().lastRefreshAt;
        const now = clock.now();
        if (last && Date.parse(now) - Date.parse(last) < ms) {
          set({ now });
          return;
        }
        await get().refresh();
      },

      async tick() {
        if (clock.today() !== get().today) {
          await get().refresh();
          return;
        }
        await get().refreshIfOlderThan(staleAfterMs);
      },

      async connect(mode) {
        if (get().connecting) return;
        set({ connecting: true, message: null });
        try {
          const email = await service.connect(mode);
          let calendars: CalendarAccount["calendars"] = [];
          if (mode === "details") {
            try {
              calendars = (await service.listCalendars(email)).map((c) => ({ id: c.id, name: c.name, selected: c.primary }));
            } catch (error) {
              const failure = toAgendaError(error);
              set({ message: `Conta conectada, mas não foi possível listar as agendas: ${failure.message ?? failure.kind}` });
              calendars = [{ id: "primary", name: "Principal", selected: true }];
            }
          }
          const accounts = get().accounts;
          const existing = accounts.find((a) => a.email === email);
          const account: CalendarAccount = {
            id: existing?.id ?? clock.newId(),
            email,
            mode,
            color: existing?.color ?? nextColor(accounts),
            calendars,
          };
          await saveAccounts(existing ? accounts.map((a) => (a.id === existing.id ? account : a)) : [...accounts, account]);
          const status = { ...get().status };
          delete status[account.id];
          set({ status });
          await get().refresh();
        } catch (error) {
          set({ message: connectErrorMessage(toAgendaError(error)) });
        } finally {
          set({ connecting: false });
        }
      },

      async disconnect(accountId) {
        const account = get().accounts.find((a) => a.id === accountId);
        if (!account) return;
        try {
          await service.disconnect(account.email);
        } catch (error) {
          const failure = toAgendaError(error);
          set({
            message: `A conta saiu do app, mas a permissão pode ter ficado nas Chaves do macOS: ${failure.message ?? failure.kind}`,
          });
        }
        await saveAccounts(get().accounts.filter((a) => a.id !== accountId));
        const status = { ...get().status };
        delete status[accountId];
        set({ status });
        const cache = get().cache;
        if (cache) {
          const accounts = { ...cache.accounts };
          delete accounts[accountId];
          await saveCache({ ...cache, accounts });
        }
      },

      async toggleCalendar(accountId, calendarId) {
        await saveAccounts(
          get().accounts.map((a) =>
            a.id === accountId
              ? { ...a, calendars: a.calendars.map((c) => (c.id === calendarId ? { ...c, selected: !c.selected } : c)) }
              : a,
          ),
        );
        await get().refresh();
      },

      async setColor(accountId, color) {
        await saveAccounts(get().accounts.map((a) => (a.id === accountId ? { ...a, color } : a)));
      },

      dismissMessage: () => set({ message: null }),
    };
  });
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm test src/store && pnpm typecheck && pnpm lint`
Expected: todos passam, incluindo os testes antigos do `appStore` (que usam `fakeClock` e `memorySettings`). Saída sem avisos.

- [ ] **Step 6: Commit**

```bash
git add src/store
git commit -m "feat(store): store da agenda com contas, atualização por conta e cache"
```

---
### Task 5: Adaptadores de plataforma da agenda

**Files:**
- Create: `src/platform/googleCalendar.ts`, `src/platform/agendaLifecycle.ts`
- Modify: `src/platform/settings.ts`, `.github/workflows/release.yml`
- Test: `src/platform/googleCalendar.test.ts`, `src/platform/agendaLifecycle.test.ts`, `src/platform/settings.test.ts`

**Interfaces:**
- Consumes: `CalendarService`, `CalendarInfo`, `FetchRequest`, `FetchResult`, `AgendaSettings`, `toAgendaError`, `AgendaStore`, `createAgendaStore` (Task 4); `agendaItemSchema`, `parseCalendarAccounts`, `CalendarAccount` (Task 3); `LifecycleWindow` (`platform/windowLifecycle`); comandos Rust da Task 2.
- Produces:
  - `tauriCalendarService: CalendarService`
  - `createTauriSettings(): Promise<Settings & AgendaSettings>` (mesma função da Fase 2, agora com `getCalendarAccounts`/`setCalendarAccounts` na chave `calendarAccounts`)
  - `AGENDA_FOCUS_MIN_INTERVAL_MS = 60_000`, `attachAgendaLifecycle(agenda: AgendaStore, win: Pick<LifecycleWindow, "onFocusChanged">, tickMs?: number): Promise<() => void>`

- [ ] **Step 1: Escrever os testes que falham**

`src/platform/googleCalendar.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const core = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => core);

import { tauriCalendarService } from "./googleCalendar";

beforeEach(() => {
  core.invoke.mockReset();
});

describe("tauriCalendarService", () => {
  it("connect chama o comando com o modo e devolve o e-mail", async () => {
    core.invoke.mockResolvedValueOnce({ email: "pessoal@gmail.com" });
    expect(await tauriCalendarService.connect("busy")).toBe("pessoal@gmail.com");
    expect(core.invoke).toHaveBeenCalledWith("google_connect", { mode: "busy" });
  });

  it("erros do Rust viram AgendaError", async () => {
    core.invoke.mockRejectedValueOnce({ kind: "adminBlocked" });
    await expect(tauriCalendarService.connect("details")).rejects.toEqual({ kind: "adminBlocked" });
    core.invoke.mockRejectedValueOnce("texto solto");
    await expect(tauriCalendarService.listCalendars("x")).rejects.toEqual({ kind: "other", message: "texto solto" });
  });

  it("fetchDay repassa pedidos e converte os resultados por conta", async () => {
    core.invoke.mockResolvedValueOnce([
      { email: "a@gmail.com", items: [{ kind: "event", title: "X", start: "s", end: "e", allDay: false }] },
      { email: "b@yousalaw.com", error: { kind: "offline", message: "sem rede" } },
      { email: "c@gmail.com", items: [{ kind: "estranho" }] },
    ]);
    const requests = [{ email: "a@gmail.com", mode: "details" as const, calendarIds: ["primary"] }];
    const results = await tauriCalendarService.fetchDay(requests, "ini", "fim");
    expect(core.invoke).toHaveBeenCalledWith("google_fetch_day", { accounts: requests, dayStart: "ini", dayEnd: "fim" });
    expect(results).toEqual([
      { email: "a@gmail.com", items: [{ kind: "event", title: "X", start: "s", end: "e", allDay: false }] },
      { email: "b@yousalaw.com", error: { kind: "offline", message: "sem rede" } },
      { email: "c@gmail.com", error: { kind: "other", message: "Resposta inesperada da agenda." } },
    ]);
  });

  it("isConfigured devolve false se o comando falhar", async () => {
    core.invoke.mockRejectedValueOnce(new Error("sem comando"));
    expect(await tauriCalendarService.isConfigured()).toBe(false);
  });
});
```

`src/platform/settings.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";

const values = vi.hoisted(() => new Map<string, unknown>());
const storeMock = vi.hoisted(() => ({
  load: vi.fn(async () => ({
    get: async (key: string) => values.get(key),
    set: async (key: string, value: unknown) => {
      values.set(key, value);
    },
    save: vi.fn(async () => {}),
  })),
}));
vi.mock("@tauri-apps/plugin-store", () => storeMock);

import { createTauriSettings } from "./settings";

describe("createTauriSettings", () => {
  it("guarda pasta e contas da agenda no mesmo settings.json", async () => {
    const settings = await createTauriSettings();
    expect(await settings.getCalendarAccounts()).toEqual([]);
    const account = { id: "a1", email: "p@gmail.com", mode: "busy" as const, color: "sky" as const, calendars: [] };
    await settings.setCalendarAccounts([account]);
    expect(await settings.getCalendarAccounts()).toEqual([account]);
    await settings.setDataDir("/data");
    expect(await settings.getDataDir()).toBe("/data");
    expect(storeMock.load).toHaveBeenCalledOnce();
  });

  it("contas inválidas no arquivo viram lista vazia", async () => {
    values.set("calendarAccounts", [{ email: "sem id" }]);
    const settings = await createTauriSettings();
    expect(await settings.getCalendarAccounts()).toEqual([]);
  });
});
```

`src/platform/agendaLifecycle.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAgendaStore } from "../store/agendaStore";
import { fakeCalendarService, fakeClock, memoryAgendaCache, memorySettings } from "../store/testing";
import { AGENDA_FOCUS_MIN_INTERVAL_MS, attachAgendaLifecycle } from "./agendaLifecycle";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function setup() {
  const agenda = createAgendaStore({
    service: fakeCalendarService(),
    settings: memorySettings(),
    cache: memoryAgendaCache(),
    clock: fakeClock("2026-09-24"),
  });
  let focus: ((event: { payload: boolean }) => void) | undefined;
  const win = {
    onFocusChanged: async (handler: (event: { payload: boolean }) => void) => {
      focus = handler;
    },
  };
  return { agenda, win, focus: (payload: boolean) => focus?.({ payload }) };
}

describe("attachAgendaLifecycle", () => {
  it("ao ganhar foco atualiza se os dados tiverem mais de 1 minuto", async () => {
    const { agenda, win, focus } = setup();
    const refreshIfOlderThan = vi.spyOn(agenda.getState(), "refreshIfOlderThan");
    const stop = await attachAgendaLifecycle(agenda, win);
    focus(false);
    expect(refreshIfOlderThan).not.toHaveBeenCalled();
    focus(true);
    expect(refreshIfOlderThan).toHaveBeenCalledWith(AGENDA_FOCUS_MIN_INTERVAL_MS);
    stop();
  });

  it("chama tick a cada intervalo e para ao desligar", async () => {
    const { agenda, win } = setup();
    const tick = vi.spyOn(agenda.getState(), "tick");
    const stop = await attachAgendaLifecycle(agenda, win, 1000);
    await vi.advanceTimersByTimeAsync(3000);
    expect(tick).toHaveBeenCalledTimes(3);
    stop();
    await vi.advanceTimersByTimeAsync(3000);
    expect(tick).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/platform`
Expected: FAIL nos arquivos novos (imports não resolvidos) e no `settings.test.ts` (`getCalendarAccounts` não existe).

- [ ] **Step 3: Implementar**

`src/platform/googleCalendar.ts`:
```ts
import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { agendaItemSchema } from "../domain/agenda";
import { toAgendaError, type CalendarInfo, type CalendarService, type FetchResult } from "../store/agendaStore";

const itemsSchema = z.array(agendaItemSchema);

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw toAgendaError(error);
  }
}

export const tauriCalendarService: CalendarService = {
  isConfigured: () => call<boolean>("google_is_configured").catch(() => false),

  async connect(mode) {
    const result = await call<{ email: string }>("google_connect", { mode });
    return result.email;
  },

  disconnect: (email) => call<void>("google_disconnect", { email }),

  listCalendars: (email) => call<CalendarInfo[]>("google_list_calendars", { email }),

  async fetchDay(requests, dayStart, dayEnd) {
    const raw = await call<{ email: string; items?: unknown; error?: unknown }[]>("google_fetch_day", {
      accounts: requests,
      dayStart,
      dayEnd,
    });
    return raw.map((result): FetchResult => {
      if (result.error !== undefined) return { email: result.email, error: toAgendaError(result.error) };
      const items = itemsSchema.safeParse(result.items ?? []);
      return items.success
        ? { email: result.email, items: items.data }
        : { email: result.email, error: { kind: "other", message: "Resposta inesperada da agenda." } };
    });
  },
};
```

`src/platform/settings.ts` (substitui o arquivo):
```ts
import { load } from "@tauri-apps/plugin-store";
import { parseCalendarAccounts } from "../domain/agenda";
import type { AgendaSettings } from "../store/agendaStore";
import type { Settings } from "../store/appStore";

const DATA_DIR_KEY = "dataDir";
const CALENDAR_ACCOUNTS_KEY = "calendarAccounts";

/** Configuração deste Mac (fora da pasta de dados): pasta escolhida e contas da agenda. */
export async function createTauriSettings(): Promise<Settings & AgendaSettings> {
  const store = await load("settings.json", { autoSave: false });
  return {
    async getDataDir() {
      return (await store.get<string>(DATA_DIR_KEY)) ?? null;
    },
    async setDataDir(dir) {
      await store.set(DATA_DIR_KEY, dir);
      await store.save();
    },
    async getCalendarAccounts() {
      return parseCalendarAccounts(await store.get(CALENDAR_ACCOUNTS_KEY));
    },
    async setCalendarAccounts(accounts) {
      await store.set(CALENDAR_ACCOUNTS_KEY, accounts);
      await store.save();
    },
  };
}
```
Antes de substituir, confira se o `settings.ts` atual tem algo além de `getDataDir`/`setDataDir`; se tiver, preserve e registre no relatório.

`src/platform/agendaLifecycle.ts`:
```ts
import type { AgendaStore } from "../store/agendaStore";
import type { LifecycleWindow } from "./windowLifecycle";

export const AGENDA_FOCUS_MIN_INTERVAL_MS = 60_000;

/** Foco: atualiza se os dados tiverem mais de 1 minuto. Timer: virada do dia e dados com mais de 15 min. */
export async function attachAgendaLifecycle(
  agenda: AgendaStore,
  win: Pick<LifecycleWindow, "onFocusChanged">,
  tickMs = 60_000,
): Promise<() => void> {
  await win.onFocusChanged(({ payload: focused }) => {
    if (focused) void agenda.getState().refreshIfOlderThan(AGENDA_FOCUS_MIN_INTERVAL_MS);
  });
  const timer = setInterval(() => {
    void agenda.getState().tick();
  }, tickMs);
  return () => clearInterval(timer);
}
```

Em `.github/workflows/release.yml`, no `env` do passo `tauri-apps/tauri-action@v1`, acrescente:
```yaml
          GOOGLE_CLIENT_ID: ${{ secrets.GOOGLE_CLIENT_ID }}
          GOOGLE_CLIENT_SECRET: ${{ secrets.GOOGLE_CLIENT_SECRET }}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test src/platform && pnpm typecheck && pnpm lint`
Expected: todos passam.

- [ ] **Step 5: Commit**

```bash
git add src/platform .github/workflows/release.yml
git commit -m "feat(platform): serviço da agenda sobre os comandos Tauri, contas no settings.json e ciclo de atualização"
```

---

### Task 6: Seção Agenda na tela Hoje

**Files:**
- Create: `src/ui/today/AgendaSection.tsx`
- Modify: `src/ui/context.tsx`, `src/ui/format.ts`, `src/ui/testing.tsx`, `src/ui/today/TodayView.tsx`, `src/ui/App.test.tsx`
- Test: `src/ui/today/AgendaSection.test.tsx`

**Interfaces:**
- Consumes: `buildAgenda`, `AgendaCache`, `CalendarAccount`, `AgendaColor` (Task 3); `createAgendaStore`, `AgendaStore`, `AgendaStoreState`, `AccountStatus`, `CalendarService` (Task 4); `fakeCalendarService`, `memoryAgendaCache` (Task 4).
- Produces:
  - `AppProvider({ store, agenda, platform, children })` (nova prop obrigatória `agenda: AgendaStore`), `useAgenda<T>(selector: (s: AgendaStoreState) => T): T`
  - `AGENDA_COLOR_CLASS: Record<AgendaColor, string>`, `AGENDA_COLOR_NAME: Record<AgendaColor, string>` em `format.ts`
  - `setupApp(ui, { seed?, platform?, agenda?: { accounts?; cache?; service? } })` devolve também `agenda` (store) e `agendaService`; o agenda store usa o mesmo `fakeClock` e já passou pelo `init()`
  - `agendaStatusText(accounts, status, cache, lastRefreshAt, refreshing): string` e `AgendaSection()` em `AgendaSection.tsx`

- [ ] **Step 1: Contexto, cores e helper de teste**

Em `src/ui/context.tsx`:
- importe `import type { AgendaStore, AgendaStoreState } from "../store/agendaStore";`
- crie `const AgendaContext = createContext<AgendaStore | null>(null);`
- `AppProvider` recebe `agenda: AgendaStore` e envolve os filhos também com `<AgendaContext.Provider value={agenda}>`
- acrescente:
```tsx
/** Mesmas regras do useApp: selecione só valores estáveis. */
export function useAgenda<T>(selector: (state: AgendaStoreState) => T): T {
  const agenda = useContext(AgendaContext);
  if (!agenda) throw new Error("useAgenda precisa estar dentro de AppProvider");
  return useStore(agenda, selector);
}
```

Em `src/ui/format.ts`, acrescente:
```ts
import type { AgendaColor } from "../domain/agenda";

export const AGENDA_COLOR_CLASS: Record<AgendaColor, string> = {
  sky: "bg-sky-500",
  violet: "bg-violet-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  teal: "bg-teal-500",
};

export const AGENDA_COLOR_NAME: Record<AgendaColor, string> = {
  sky: "Azul",
  violet: "Roxo",
  emerald: "Verde",
  amber: "Amarelo",
  rose: "Rosa",
  teal: "Turquesa",
};
```

Em `src/ui/testing.tsx`, dentro de `setupApp`:
- o tipo de `options` ganha `agenda?: { accounts?: CalendarAccount[]; cache?: AgendaCache | null; service?: Partial<CalendarService> }`
- depois de criar `clock` e o store principal, crie:
```tsx
  const agendaService = fakeCalendarService(options.agenda?.service);
  const agenda = createAgendaStore({
    service: agendaService,
    settings: memorySettings(null, options.agenda?.accounts ?? []),
    cache: memoryAgendaCache(options.agenda?.cache ?? null),
    clock,
  });
  await agenda.getState().init();
```
- passe `agenda={agenda}` ao `AppProvider` e devolva `agenda` e `agendaService` junto com o resto.

Em `src/ui/App.test.tsx`, no `renderApp`, crie um agenda store com `createAgendaStore({ service: fakeCalendarService(), settings: memorySettings(), cache: memoryAgendaCache(), clock: fakeClock() })` e passe `agenda={...}` ao `AppProvider`.

- [ ] **Step 2: Escrever o teste que falha**

`src/ui/today/AgendaSection.test.tsx`:
```tsx
// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgendaCache, CalendarAccount } from "../../domain/agenda";
import { setupApp } from "../testing";
import { AgendaSection } from "./AgendaSection";
import { TodayView } from "./TodayView";

const originalTz = process.env.TZ;
beforeEach(() => {
  process.env.TZ = "America/Sao_Paulo";
});
afterEach(() => {
  cleanup();
  process.env.TZ = originalTz;
});

// setupApp usa fakeClock(): hoje = 2026-09-23, agora = 2026-09-23T12:00:00.000Z (09:00 em São Paulo)
const pessoal: CalendarAccount = {
  id: "a1",
  email: "pessoal@gmail.com",
  mode: "details",
  color: "sky",
  calendars: [{ id: "primary", name: "Pessoal", selected: true }],
};
const trabalho: CalendarAccount = { id: "a2", email: "voce@yousalaw.com", mode: "busy", color: "violet", calendars: [] };

const items = {
  a1: [
    { kind: "event" as const, title: "Café", start: "2026-09-23T07:00:00-03:00", end: "2026-09-23T07:30:00-03:00", allDay: false },
    { kind: "event" as const, title: "Dentista", start: "2026-09-23T08:30:00-03:00", end: "2026-09-23T09:30:00-03:00", allDay: false },
  ],
  a2: [{ kind: "busy" as const, start: "2026-09-23T10:00:00-03:00", end: "2026-09-23T11:00:00-03:00", allDay: false }],
};
const fetchAll = () =>
  vi.fn(async (requests: { email: string }[]) =>
    requests.map((r) => ({ email: r.email, items: r.email === "pessoal@gmail.com" ? items.a1 : items.a2 })),
  );

describe("AgendaSection", () => {
  it("sem contas convida a conectar", async () => {
    await setupApp(<AgendaSection />);
    expect(screen.getByText("Conecte sua agenda do Google em Configurações.")).toBeTruthy();
  });

  it("build sem credencial e sem contas não mostra a seção", async () => {
    await setupApp(<AgendaSection />, { agenda: { service: { isConfigured: vi.fn(async () => false) } } });
    expect(screen.queryByRole("region", { name: "Agenda" })).toBeNull();
  });

  it("mostra eventos e blocos das contas em ordem, com o status", async () => {
    await setupApp(<AgendaSection />, { agenda: { accounts: [pessoal, trabalho], service: { fetchDay: fetchAll() } } });
    const agenda = within(screen.getByRole("region", { name: "Agenda" }));
    const rows = agenda.getAllByRole("listitem").map((li) => li.textContent);
    expect(rows).toEqual(["07:00Café", "08:30Dentista", "10:00Ocupado (até 11:00)"]);
    expect(agenda.getByText("Café").closest("li")?.className).toContain("opacity-50");
    expect(agenda.getByText("Dentista").closest("li")?.className).not.toContain("opacity-50");
    expect(agenda.getAllByRole("img", { name: "Conta voce@yousalaw.com" })).toHaveLength(1);
    expect(agenda.getByRole("button", { name: "atualizada às 09:00" })).toBeTruthy();
  });

  it("sem conexão mostra o cache com o horário dos dados", async () => {
    const cache: AgendaCache = {
      date: "2026-09-23",
      accounts: { a2: { fetchedAt: "2026-09-23T11:12:00.000Z", items: items.a2 } },
    };
    const fetchDay = vi.fn(async () => [{ email: "voce@yousalaw.com", error: { kind: "offline" as const } }]);
    await setupApp(<AgendaSection />, { agenda: { accounts: [trabalho], cache, service: { fetchDay } } });
    expect(screen.getByRole("button", { name: "sem conexão · dados de 08:12" })).toBeTruthy();
    expect(screen.getByText("Ocupado (até 11:00)")).toBeTruthy();
  });

  it("permissão revogada pede para reconectar", async () => {
    const fetchDay = vi.fn(async () => [{ email: "pessoal@gmail.com", error: { kind: "revoked" as const } }]);
    await setupApp(<AgendaSection />, { agenda: { accounts: [pessoal], service: { fetchDay } } });
    expect(screen.getByRole("button", { name: "reconecte a conta pessoal@gmail.com" })).toBeTruthy();
    expect(screen.getByText("Nenhum evento hoje.")).toBeTruthy();
  });

  it("clicar no status atualiza de novo", async () => {
    const { user, agendaService } = await setupApp(<AgendaSection />, {
      agenda: { accounts: [pessoal], service: { fetchDay: fetchAll() } },
    });
    await user.click(screen.getByRole("button", { name: /atualizada às/ }));
    await waitFor(() => expect(agendaService.fetchDay).toHaveBeenCalledTimes(2));
  });

  it("na tela Hoje a Agenda vem antes da Rotina", async () => {
    await setupApp(<TodayView />, { agenda: { accounts: [pessoal], service: { fetchDay: fetchAll() } } });
    const names = screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"));
    expect(names.slice(0, 2)).toEqual(["Agenda", "Rotina"]);
  });
});
```
`fetchAll()` cria um mock novo por teste, para a contagem de chamadas não passar de um teste para outro.

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm test src/ui/today`
Expected: FAIL, `Failed to resolve import "./AgendaSection"`.

- [ ] **Step 4: Implementar**

`src/ui/today/AgendaSection.tsx`:
```tsx
import { useMemo } from "react";
import { buildAgenda, type AgendaCache, type CalendarAccount } from "../../domain/agenda";
import type { AccountStatus } from "../../store/agendaStore";
import { useAgenda, useApp } from "../context";
import { AGENDA_COLOR_CLASS } from "../format";
import { sectionTitle } from "../styles";

const pad = (n: number) => String(n).padStart(2, "0");
const clock = (iso: string) => {
  const date = new Date(iso);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export function agendaStatusText(
  accounts: readonly CalendarAccount[],
  status: Record<string, AccountStatus>,
  cache: AgendaCache | null,
  lastRefreshAt: string | null,
  refreshing: boolean,
): string {
  const revoked = accounts.find((a) => status[a.id] === "revoked");
  if (revoked) return `reconecte a conta ${revoked.email}`;
  const offline = accounts.filter((a) => status[a.id] === "offline");
  if (offline.length > 0) {
    const times = offline
      .map((a) => cache?.accounts[a.id]?.fetchedAt)
      .filter((t): t is string => t !== undefined)
      .sort();
    return times[0] ? `sem conexão · dados de ${clock(times[0])}` : "sem conexão";
  }
  if (lastRefreshAt) return `atualizada às ${clock(lastRefreshAt)}`;
  return refreshing ? "atualizando…" : "";
}

export function AgendaSection() {
  const ready = useAgenda((s) => s.ready);
  const configured = useAgenda((s) => s.configured);
  const accounts = useAgenda((s) => s.accounts);
  const cache = useAgenda((s) => s.cache);
  const status = useAgenda((s) => s.status);
  const lastRefreshAt = useAgenda((s) => s.lastRefreshAt);
  const refreshing = useAgenda((s) => s.refreshing);
  const now = useAgenda((s) => s.now);
  const refresh = useAgenda((s) => s.refresh);
  const today = useApp((s) => s.today);
  const rows = useMemo(() => buildAgenda(cache, accounts, today, new Date(now)), [cache, accounts, today, now]);

  if (!ready || (!configured && accounts.length === 0)) return null;
  const statusText = agendaStatusText(accounts, status, cache, lastRefreshAt, refreshing);

  return (
    <section aria-label="Agenda">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className={sectionTitle}>Agenda</h2>
        {accounts.length > 0 && statusText && (
          <button
            type="button"
            title="Atualizar agora"
            className="text-xs text-zinc-500 hover:underline"
            onClick={() => void refresh()}
          >
            {statusText}
          </button>
        )}
      </div>
      {accounts.length === 0 ? (
        <p className="text-sm text-zinc-500">Conecte sua agenda do Google em Configurações.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-zinc-500">Nenhum evento hoje.</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((row) => (
            <li key={row.key} className={`flex items-center gap-3 text-sm ${row.past ? "opacity-50" : ""}`}>
              <span className="w-24 shrink-0 text-xs text-zinc-500 tabular-nums">{row.timeLabel}</span>
              <span className={`flex-1 ${row.kind === "busy" ? "text-zinc-500 italic" : ""}`}>{row.title}</span>
              <span
                role="img"
                aria-label={`Conta ${row.accountEmail}`}
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${AGENDA_COLOR_CLASS[row.color]}`}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

Em `src/ui/today/TodayView.tsx`, importe `AgendaSection` e renderize `<AgendaSection />` logo depois do `<header>` e antes da `<section aria-label="Rotina">`.

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: todos passam (os testes antigos de UI continuam verdes com o agenda store no `setupApp`), saída sem avisos.

- [ ] **Step 6: Commit**

```bash
git add src/ui
git commit -m "feat(ui): seção Agenda na tela Hoje"
```

---
### Task 7: Configurações da Agenda do Google e montagem no app

**Files:**
- Create: `src/ui/settings/GoogleAccounts.tsx`
- Modify: `src/ui/settings/SettingsView.tsx`, `src/main.tsx`
- Test: `src/ui/settings/GoogleAccounts.test.tsx`

**Interfaces:**
- Consumes: `useAgenda`, `usePlatform`; `AGENDA_COLORS`, `CalendarAccount`; `AGENDA_COLOR_CLASS`, `AGENDA_COLOR_NAME`; styles; `setupApp` (com `agenda`); `createAgendaStore`, `createFileAgendaCache`, `tauriCalendarService`, `attachAgendaLifecycle`, `createTauriSettings`, `tauriFs`, `systemClock`.
- Produces: `GoogleAccounts()`; `SettingsView` passa a mostrá-la; `main.tsx` monta o agenda store.

- [ ] **Step 1: Escrever o teste que falha**

`src/ui/settings/GoogleAccounts.test.tsx`:
```tsx
// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CalendarAccount } from "../../domain/agenda";
import { setupApp } from "../testing";
import { GoogleAccounts } from "./GoogleAccounts";

afterEach(cleanup);

const pessoal: CalendarAccount = {
  id: "a1",
  email: "pessoal@gmail.com",
  mode: "details",
  color: "sky",
  calendars: [
    { id: "primary", name: "Pessoal", selected: true },
    { id: "feriados", name: "Feriados", selected: false },
  ],
};
const accountsList = () => within(screen.getByRole("list", { name: "Contas conectadas" }));

describe("GoogleAccounts", () => {
  it("build sem credencial mostra o aviso e não permite conectar", async () => {
    await setupApp(<GoogleAccounts />, { agenda: { service: { isConfigured: vi.fn(async () => false) } } });
    expect(screen.getByText("Integração com o Google não configurada neste build.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Conectar conta" })).toBeNull();
  });

  it("conecta com detalhes e lista as agendas", async () => {
    const { user, agendaService } = await setupApp(<GoogleAccounts />, {
      agenda: {
        service: {
          listCalendars: vi.fn(async () => [
            { id: "primary", name: "Pessoal", primary: true },
            { id: "familia", name: "Família", primary: false },
          ]),
        },
      },
    });
    expect(screen.getByText(/O app só lê a agenda/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Conectar conta" }));
    await user.click(screen.getByRole("button", { name: "Com detalhes" }));
    await waitFor(() => accountsList().getByText("pessoal@gmail.com"));
    expect(agendaService.connect).toHaveBeenCalledWith("details");
    expect(accountsList().getByText("Com detalhes")).toBeTruthy();
    expect((accountsList().getByRole("checkbox", { name: "Pessoal" }) as HTMLInputElement).checked).toBe(true);
    expect((accountsList().getByRole("checkbox", { name: "Família" }) as HTMLInputElement).checked).toBe(false);
  });

  it("conecta em só horários, sem lista de agendas", async () => {
    const { user } = await setupApp(<GoogleAccounts />, {
      agenda: { service: { connect: vi.fn(async () => "voce@yousalaw.com") } },
    });
    await user.click(screen.getByRole("button", { name: "Conectar conta" }));
    await user.click(screen.getByRole("button", { name: "Só horários, sem títulos" }));
    await waitFor(() => accountsList().getByText("voce@yousalaw.com"));
    expect(accountsList().getByText("Só horários")).toBeTruthy();
    expect(accountsList().queryByRole("checkbox")).toBeNull();
  });

  it("cancelar a escolha de modo não conecta", async () => {
    const { user, agendaService } = await setupApp(<GoogleAccounts />);
    await user.click(screen.getByRole("button", { name: "Conectar conta" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(agendaService.connect).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Conectar conta" })).toBeTruthy();
  });

  it("marca agendas, troca a cor e desconecta com confirmação", async () => {
    const { user, agenda, platform } = await setupApp(<GoogleAccounts />, { agenda: { accounts: [pessoal] } });
    await user.click(accountsList().getByRole("checkbox", { name: "Feriados" }));
    await waitFor(() => expect(agenda.getState().accounts[0]?.calendars[1]?.selected).toBe(true));
    await user.selectOptions(accountsList().getByRole("combobox", { name: "Cor de pessoal@gmail.com" }), "amber");
    await waitFor(() => expect(agenda.getState().accounts[0]?.color).toBe("amber"));
    await user.click(accountsList().getByRole("button", { name: "Desconectar" }));
    await waitFor(() => expect(agenda.getState().accounts).toEqual([]));
    expect(platform.confirm).toHaveBeenCalledOnce();
  });

  it("mostra o erro de conexão e permite fechar", async () => {
    const { user } = await setupApp(<GoogleAccounts />, {
      agenda: { service: { connect: vi.fn(async () => Promise.reject({ kind: "adminBlocked" })) } },
    });
    await user.click(screen.getByRole("button", { name: "Conectar conta" }));
    await user.click(screen.getByRole("button", { name: "Só horários, sem títulos" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("O administrador da conta bloqueou este app.");
    await user.click(within(alert).getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("conta com permissão expirada oferece reconectar no mesmo modo", async () => {
    const { user, agendaService } = await setupApp(<GoogleAccounts />, {
      agenda: {
        accounts: [pessoal],
        service: { fetchDay: vi.fn(async () => [{ email: "pessoal@gmail.com", error: { kind: "revoked" as const } }]) },
      },
    });
    expect(accountsList().getByText("Permissão expirada.")).toBeTruthy();
    await user.click(accountsList().getByRole("button", { name: "Reconectar" }));
    await waitFor(() => expect(agendaService.connect).toHaveBeenCalledWith("details"));
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test src/ui/settings`
Expected: FAIL, `Failed to resolve import "./GoogleAccounts"`.

- [ ] **Step 3: Implementar**

`src/ui/settings/GoogleAccounts.tsx`:
```tsx
import { useState } from "react";
import { AGENDA_COLORS, type AgendaColor, type CalendarAccount } from "../../domain/agenda";
import { useAgenda, usePlatform } from "../context";
import { AGENDA_COLOR_CLASS, AGENDA_COLOR_NAME } from "../format";
import { btn, btnDanger, btnPrimary, cardBox, input, sectionTitle } from "../styles";

export function GoogleAccounts() {
  const configured = useAgenda((s) => s.configured);
  const accounts = useAgenda((s) => s.accounts);
  const connecting = useAgenda((s) => s.connecting);
  const message = useAgenda((s) => s.message);
  const connect = useAgenda((s) => s.connect);
  const dismissMessage = useAgenda((s) => s.dismissMessage);
  const [choosing, setChoosing] = useState(false);

  if (!configured) {
    return (
      <section aria-label="Agenda do Google" className={`${cardBox} space-y-2 p-4`}>
        <h2 className={sectionTitle}>Agenda do Google</h2>
        <p className="text-sm text-zinc-500">Integração com o Google não configurada neste build.</p>
      </section>
    );
  }

  return (
    <section aria-label="Agenda do Google" className={`${cardBox} space-y-3 p-4`}>
      <h2 className={sectionTitle}>Agenda do Google</h2>
      <p className="text-xs text-zinc-500">
        O app só lê a agenda. Contas em "Só horários" não recebem títulos nem detalhes dos eventos.
      </p>
      {message && (
        <div role="alert" className="flex items-start gap-2 rounded-md bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          <p className="flex-1">{message}</p>
          <button type="button" className={btn} onClick={dismissMessage}>
            Fechar
          </button>
        </div>
      )}
      {accounts.length > 0 && (
        <ul aria-label="Contas conectadas" className="space-y-3">
          {accounts.map((account) => (
            <AccountRow key={account.id} account={account} />
          ))}
        </ul>
      )}
      {choosing ? (
        <div role="group" aria-label="Como conectar" className="flex flex-wrap gap-2">
          <button
            type="button"
            className={btnPrimary}
            onClick={() => {
              setChoosing(false);
              void connect("details");
            }}
          >
            Com detalhes
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => {
              setChoosing(false);
              void connect("busy");
            }}
          >
            Só horários, sem títulos
          </button>
          <button type="button" className={btn} onClick={() => setChoosing(false)}>
            Cancelar
          </button>
        </div>
      ) : (
        <button type="button" className={btn} disabled={connecting} onClick={() => setChoosing(true)}>
          {connecting ? "Aguardando o navegador…" : "Conectar conta"}
        </button>
      )}
    </section>
  );
}

function AccountRow({ account }: { account: CalendarAccount }) {
  const status = useAgenda((s) => s.status[account.id]);
  const connect = useAgenda((s) => s.connect);
  const disconnect = useAgenda((s) => s.disconnect);
  const toggleCalendar = useAgenda((s) => s.toggleCalendar);
  const setColor = useAgenda((s) => s.setColor);
  const { confirm } = usePlatform();

  async function remove() {
    if (await confirm(`Desconectar ${account.email}? A permissão será apagada deste Mac.`)) {
      await disconnect(account.id);
    }
  }

  return (
    <li className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${AGENDA_COLOR_CLASS[account.color]}`} />
        <span className="text-sm font-medium">{account.email}</span>
        <span className="text-xs text-zinc-500">{account.mode === "busy" ? "Só horários" : "Com detalhes"}</span>
        <select
          aria-label={`Cor de ${account.email}`}
          className={`${input} w-auto`}
          value={account.color}
          onChange={(e) => void setColor(account.id, e.target.value as AgendaColor)}
        >
          {AGENDA_COLORS.map((color) => (
            <option key={color} value={color}>
              {AGENDA_COLOR_NAME[color]}
            </option>
          ))}
        </select>
        <button type="button" className={`${btnDanger} ml-auto`} onClick={() => void remove()}>
          Desconectar
        </button>
      </div>
      {status === "revoked" && (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <p>Permissão expirada.</p>
          <button type="button" className={btn} onClick={() => void connect(account.mode)}>
            Reconectar
          </button>
        </div>
      )}
      {account.mode === "details" && (
        <fieldset className="space-y-1">
          <legend className="text-xs text-zinc-500">Agendas</legend>
          {account.calendars.map((calendar) => (
            <label key={calendar.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={calendar.selected}
                onChange={() => void toggleCalendar(account.id, calendar.id)}
              />
              {calendar.name}
            </label>
          ))}
        </fieldset>
      )}
    </li>
  );
}
```
O `as AgendaColor` no `onChange` é seguro: o `<select>` só oferece valores de `AGENDA_COLORS`.

Em `src/ui/settings/SettingsView.tsx`, importe `GoogleAccounts` e renderize `<GoogleAccounts />` logo depois da seção "Pasta de dados".

`src/main.tsx`: dentro de `start()`, depois de criar o store principal (reaproveitando o mesmo objeto de `createTauriSettings()`, que agora implementa as duas interfaces):
```tsx
  const settings = await createTauriSettings();
  const store = createAppStore({ fs: tauriFs, settings, clock: systemClock });
  const agenda = createAgendaStore({
    service: tauriCalendarService,
    settings,
    cache: createFileAgendaCache(tauriFs, await appCacheDir()),
    clock: systemClock,
  });
```
Passe `agenda={agenda}` ao `AppProvider`. Depois do `attachWindowLifecycle(...)` existente, acrescente `await attachAgendaLifecycle(agenda, getCurrentWindow());`. Depois do `await store.getState().boot();`, acrescente `void agenda.getState().init();` (a agenda não bloqueia a abertura do app). Imports novos: `appCacheDir` de `@tauri-apps/api/path`, `createAgendaStore` de `./store/agendaStore`, `createFileAgendaCache` de `./store/agendaCache`, `tauriCalendarService` de `./platform/googleCalendar`, `attachAgendaLifecycle` de `./platform/agendaLifecycle`. Preserve todo o resto do `main.tsx` (tratamento de erro fatal, etc.).

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`
Expected: tudo verde, saída sem avisos.

- [ ] **Step 5: Commit**

```bash
git add src/ui src/main.tsx
git commit -m "feat(ui): contas da Agenda do Google em Configurações e agenda montada no app"
```

---

### Task 8: Guia de configuração, verificação final e PR

**Files:**
- Create: `docs/google-calendar-setup.md`

- [ ] **Step 1: Escrever o guia**

`docs/google-calendar-setup.md`:
```markdown
# Configurar a Agenda do Google no Kamban

O Kamban lê a agenda direto do seu Mac, sem servidor intermediário. Para isso ele precisa de uma credencial própria no Google Cloud. Você faz isso uma vez.

## 1. Criar o projeto
1. Entre em https://console.cloud.google.com com a sua conta pessoal (@gmail.com).
2. Crie um projeto chamado "Kamban".

## 2. Ativar a Google Calendar API
Em "APIs e serviços" > "Biblioteca", procure "Google Calendar API" e clique em "Ativar".

## 3. Tela de consentimento
1. Em "APIs e serviços" > "Tela de consentimento OAuth" (ou "Google Auth Platform"), escolha o tipo **Externo**.
2. Nome do app: Kamban. E-mail de suporte: o seu.
3. Em "Acesso a dados" (escopos), adicione:
   - `openid`
   - `.../auth/userinfo.email`
   - `https://www.googleapis.com/auth/calendar.readonly`
   - `https://www.googleapis.com/auth/calendar.freebusy`
4. Em "Público", clique em **Publicar app** para passar de "Teste" para "Produção". Não peça verificação.
   - Em "Teste", o Google expira a permissão a cada 7 dias.
   - Em "Produção" sem verificação, cada conta vê uma vez o aviso "O Google não verificou este app". Clique em "Avançado" > "Acessar Kamban (não seguro)". É o esperado para um app de uso pessoal.

## 4. Criar a credencial
1. Em "Clientes" (ou "Credenciais" > "Criar credenciais" > "ID do cliente OAuth"), escolha **App para computador**.
2. Copie o **ID do cliente** e a **chave secreta do cliente**.

## 5. Colocar a credencial no Kamban
- Para rodar no seu Mac: copie `src-tauri/.env.example` para `src-tauri/.env` e preencha `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`. Esse arquivo nunca vai para o git.
- Para o instalador do GitHub: em Settings > Secrets and variables > Actions do repositório, crie os secrets `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`.

Em apps de computador, o Google não trata essa chave secreta como confidencial: ela fica dentro do app instalado. Mesmo assim, ela não fica no código, porque o repositório é público.

## 6. Conectar as contas
Em Configurações > Agenda do Google:
- Conta pessoal: "Conectar conta" > "Com detalhes".
- Conta de trabalho (@yousalaw.com): "Conectar conta" > "Só horários, sem títulos". Nesse modo o Google só envia os horários ocupados, sem títulos nem participantes (Política YOUSA #COMP-04). Se aparecer que o administrador bloqueou o app, a TI precisa liberar o Kamban no Google Workspace.
```

- [ ] **Step 2: Verificação completa**

```bash
rm -rf node_modules dist && pnpm install --frozen-lockfile
pnpm typecheck && pnpm lint && pnpm test && pnpm build
source "$HOME/.cargo/env" && cargo test --manifest-path src-tauri/Cargo.toml
source "$HOME/.cargo/env" && pnpm tauri build --debug --bundles app
```
Expected: tudo verde e o `Kamban.app` gerado. Sem `src-tauri/.env`, o app abre e a seção de Configurações mostra "Integração com o Google não configurada neste build".

- [ ] **Step 3: Commit do guia**

```bash
git add docs/google-calendar-setup.md
git commit -m "docs: guia de configuração da Agenda do Google"
```

- [ ] **Step 4: Teste manual (pedir ao usuário)**

Com o guia seguido e o `src-tauri/.env` preenchido, recompilar (`pnpm tauri build --debug --bundles app`) e testar:
1. Conectar a @gmail.com "Com detalhes": o navegador abre, a conta autoriza, a aba mostra "Conta conectada" e as agendas aparecem em Configurações.
2. A tela Hoje mostra os eventos do dia com a cor da conta.
3. Conectar a @yousalaw.com em "Só horários" (se o Workspace permitir): aparecem só blocos "Ocupado".
4. Desligar o Wi-Fi e voltar ao app: a Agenda mostra "sem conexão · dados de HH:MM".
5. Desconectar uma conta: some da tela e de Configurações.

- [ ] **Step 5: Push e PR (confirmar com o usuário antes, é ação externa)**

```bash
git push -u origin feat/agenda-google
gh pr create --base main --title "Agenda do Google na tela Hoje" --body-file <arquivo com o corpo do PR>
```
O corpo do PR resume a entrega, aponta a spec, este plano e o guia, registra o resultado do teste manual e termina com a linha `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Depois: `gh pr checks --watch` (jobs `check` e `rust` verdes).
