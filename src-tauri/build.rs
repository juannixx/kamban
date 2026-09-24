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
