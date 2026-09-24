use super::errors::GoogleError;

const SERVICE: &str = "com.juannixx.kamban.google";

fn entry(email: &str) -> Result<keyring::Entry, GoogleError> {
  keyring::Entry::new(SERVICE, email).map_err(|e| GoogleError::Other(format!("Chaves do macOS: {e}")))
}

/// O Keychain é uma chamada bloqueante (pode até esperar o usuário clicar em "Permitir"),
/// então roda numa thread de bloqueio para não travar o runtime assíncrono.
async fn blocking<T, F>(work: F) -> Result<T, GoogleError>
where
  T: Send + 'static,
  F: FnOnce() -> Result<T, GoogleError> + Send + 'static,
{
  tokio::task::spawn_blocking(work)
    .await
    .map_err(|e| GoogleError::Other(format!("Chaves do macOS: {e}")))?
}

pub async fn save(email: &str, refresh_token: &str) -> Result<(), GoogleError> {
  let (email, refresh_token) = (email.to_owned(), refresh_token.to_owned());
  blocking(move || {
    entry(&email)?
      .set_password(&refresh_token)
      .map_err(|e| GoogleError::Other(format!("Não foi possível guardar a permissão nas Chaves do macOS: {e}")))
  })
  .await
}

pub async fn load(email: &str) -> Result<Option<String>, GoogleError> {
  let email = email.to_owned();
  blocking(move || match entry(&email)?.get_password() {
    Ok(token) => Ok(Some(token)),
    Err(keyring::Error::NoEntry) => Ok(None),
    Err(e) => Err(GoogleError::Other(format!("Não foi possível ler a permissão nas Chaves do macOS: {e}"))),
  })
  .await
}

pub async fn delete(email: &str) -> Result<(), GoogleError> {
  let email = email.to_owned();
  blocking(move || match entry(&email)?.delete_credential() {
    Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
    Err(e) => Err(GoogleError::Other(format!("Não foi possível apagar a permissão nas Chaves do macOS: {e}"))),
  })
  .await
}
