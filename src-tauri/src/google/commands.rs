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
