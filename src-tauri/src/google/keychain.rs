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
