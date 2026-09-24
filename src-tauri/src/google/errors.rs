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
