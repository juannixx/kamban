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
