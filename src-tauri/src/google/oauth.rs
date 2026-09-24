use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use url::Url;

use super::errors::{classify_oauth_error, from_reqwest, GoogleError};
use super::parse::{is_expected_callback, parse_callback, parse_token_response, Callback, TokenResponse};
use super::pkce::{challenge, random_token};

pub const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
pub const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
pub const REVOKE_URL: &str = "https://oauth2.googleapis.com/revoke";
const LOGIN_TIMEOUT: Duration = Duration::from_secs(300);
/// Tempo máximo para ler cada conexão aceita no servidor local do login. Sem isso, uma conexão
/// que abre e não manda dados (ex.: preconexão do navegador) trava o loop e o retorno de
/// verdade nunca é aceito.
const CALLBACK_READ_TIMEOUT: Duration = Duration::from_secs(5);

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

/// Escopo da agenda que o modo precisa; sem ele a conta não funciona.
pub fn calendar_scope(mode: Mode) -> &'static str {
  match mode {
    Mode::Details => "https://www.googleapis.com/auth/calendar.readonly",
    Mode::Busy => "https://www.googleapis.com/auth/calendar.freebusy",
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

async fn wait_for_callback(listener: &TcpListener, expected_state: &str) -> Result<Callback, GoogleError> {
  loop {
    let (mut stream, _) = listener
      .accept()
      .await
      .map_err(|e| GoogleError::Other(format!("Servidor local do login falhou: {e}")))?;
    let mut buf = vec![0u8; 8192];
    let read = match tokio::time::timeout(CALLBACK_READ_TIMEOUT, stream.read(&mut buf)).await {
      Ok(Ok(read)) => read,
      // Timeout (ex.: preconexão do navegador que nunca manda dados) ou erro de leitura: descarta
      // essa conexão e continua esperando o retorno de verdade, sem travar o login inteiro.
      _ => continue,
    };
    let text = String::from_utf8_lossy(&buf[..read]);
    match parse_callback(text.lines().next().unwrap_or("")) {
      Some(callback) if is_expected_callback(&callback, expected_state) => {
        let page = if callback.error.is_some() { PAGE_ERROR } else { PAGE_OK };
        respond(&mut stream, "200 OK", page).await;
        return Ok(callback);
      }
      // GET com formato de retorno, mas state errado ou ausente: outra aba ou requisição não
      // pode confirmar nem abortar o login. Responde e continua esperando o retorno de verdade.
      Some(_) => respond(&mut stream, "400 Bad Request", "").await,
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

  let callback = tokio::time::timeout(LOGIN_TIMEOUT, wait_for_callback(&listener, &state))
    .await
    .map_err(|_| GoogleError::Timeout)??;
  // wait_for_callback só devolve um Callback cujo state já bate com o esperado.
  if let Some(error) = callback.error {
    return Err(classify_oauth_error(&error));
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

#[cfg(test)]
mod tests {
  use super::*;
  use crate::google::parse::has_scope;

  #[test]
  fn escopo_da_agenda_faz_parte_dos_escopos_pedidos() {
    assert!(has_scope(scopes(Mode::Details), calendar_scope(Mode::Details)));
    assert!(has_scope(scopes(Mode::Busy), calendar_scope(Mode::Busy)));
    assert!(!has_scope(scopes(Mode::Busy), calendar_scope(Mode::Details)));
    assert!(!has_scope(scopes(Mode::Details), calendar_scope(Mode::Busy)));
  }
}
