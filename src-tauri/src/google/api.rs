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
