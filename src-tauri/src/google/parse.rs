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

/// Verdadeiro só quando o `state` do retorno bate com o gerado antes do login. Callbacks com
/// state errado ou ausente são ignorados: uma aba ou requisição qualquer (ex.: `<img>` de outra
/// página) não pode confirmar nem abortar o login de outra pessoa.
pub fn is_expected_callback(callback: &Callback, expected_state: &str) -> bool {
  callback.state.as_deref() == Some(expected_state)
}

#[derive(Debug, Deserialize)]
pub struct TokenResponse {
  pub access_token: String,
  pub expires_in: u64,
  pub refresh_token: Option<String>,
  pub id_token: Option<String>,
  /// Escopos concedidos, separados por espaço. Com o consentimento granular o usuário pode
  /// desmarcar a permissão da agenda e o login ainda assim termina com sucesso.
  pub scope: Option<String>,
}

/// `required` aparece exatamente na lista de escopos concedidos (separados por espaço).
pub fn has_scope(granted: &str, required: &str) -> bool {
  granted.split_whitespace().any(|scope| scope == required)
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

#[cfg(test)]
mod tests {
  use super::*;
  use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};

  #[test]
  fn is_expected_callback_so_aceita_o_state_esperado() {
    let com_code = Callback { code: Some("abc".into()), state: Some("xyz".into()), error: None };
    let com_erro = Callback { code: None, state: Some("xyz".into()), error: Some("access_denied".into()) };
    let state_errado = Callback { code: Some("abc".into()), state: Some("outro".into()), error: None };
    let sem_state = Callback { code: Some("abc".into()), state: None, error: None };
    assert!(is_expected_callback(&com_code, "xyz"));
    assert!(is_expected_callback(&com_erro, "xyz"));
    assert!(!is_expected_callback(&state_errado, "xyz"));
    assert!(!is_expected_callback(&sem_state, "xyz"));
  }

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
  fn resposta_de_token_guarda_os_escopos_concedidos() {
    let com = parse_token_response(200, r#"{"access_token":"at","expires_in":1,"scope":"openid email"}"#).unwrap();
    assert_eq!(com.scope.as_deref(), Some("openid email"));
    let sem = parse_token_response(200, r#"{"access_token":"at","expires_in":1}"#).unwrap();
    assert_eq!(sem.scope, None);
  }

  #[test]
  fn has_scope_exige_o_escopo_exato() {
    let granted = "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar.freebusy";
    assert!(has_scope(granted, "https://www.googleapis.com/auth/calendar.freebusy"));
    assert!(has_scope(granted, "openid"));
    assert!(!has_scope(granted, "https://www.googleapis.com/auth/calendar.readonly"));
    assert!(!has_scope(granted, "https://www.googleapis.com/auth/calendar"));
    assert!(!has_scope("https://www.googleapis.com/auth/calendar.readonly.extra", "https://www.googleapis.com/auth/calendar.readonly"));
    assert!(has_scope("  a   b ", "b"));
    assert!(!has_scope("", "openid"));
    assert!(!has_scope("openid", ""));
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
    assert!(items[1].all_day);
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
