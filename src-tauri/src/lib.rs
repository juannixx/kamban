use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::Manager;

mod google;

/// Id do item "Encerrar Kamban" do menu do app.
const QUIT_ID: &str = "quit";

/// Menu explícito no lugar do padrão do Tauri. O "Quit" padrão do macOS manda `terminate:`,
/// que encerra o app sem CloseRequested, ou seja, sem a gravação final feita pelo JS.
/// Aqui Cmd+Q fecha a janela principal: passa pelo CloseRequested (o JS grava e pergunta
/// se precisar) e, destruída a última janela, o app encerra sozinho.
fn build_menu(app: &tauri::App) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
  let quit = MenuItemBuilder::with_id(QUIT_ID, "Encerrar Kamban")
    .accelerator("CmdOrCtrl+Q")
    .build(app)?;
  let app_menu = SubmenuBuilder::new(app, "Kamban")
    .about(None)
    .separator()
    .hide()
    .hide_others()
    .show_all()
    .separator()
    .item(&quit)
    .build()?;
  let edit_menu = SubmenuBuilder::new(app, "Editar")
    .undo()
    .redo()
    .separator()
    .cut()
    .copy()
    .paste()
    .select_all()
    .build()?;
  let window_menu = SubmenuBuilder::new(app, "Janela")
    .minimize()
    .close_window()
    .build()?;
  MenuBuilder::new(app)
    .items(&[&app_menu, &edit_menu, &window_menu])
    .build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(google::api::GoogleState::new())
    .invoke_handler(tauri::generate_handler![
      google::commands::google_is_configured,
      google::commands::google_connect,
      google::commands::google_disconnect,
      google::commands::google_list_calendars,
      google::commands::google_fetch_day,
    ])
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_store::Builder::new().build())
    .plugin(tauri_plugin_opener::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      app.set_menu(build_menu(app)?)?;
      app.on_menu_event(|app, event| {
        if event.id() == QUIT_ID {
          match app.get_webview_window("main") {
            // close() passa pelo CloseRequested; sem janela não há nada a gravar.
            Some(window) => {
              if let Err(error) = window.close() {
                log::error!("falha ao fechar a janela principal: {error}");
              }
            }
            None => app.exit(0),
          }
        }
      });
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
