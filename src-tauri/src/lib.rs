#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    // Abre los vínculos del documento en el navegador predeterminado
    .plugin(tauri_plugin_opener::init())
    // Ventanas de Windows para elegir dónde guardar y qué abrir
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    // Recuerda las carpetas elegidas para que «Guardar» funcione tras reiniciar la app
    .plugin(tauri_plugin_persisted_scope::init())
    // Actualizaciones automáticas desde las Releases de GitHub (firmadas)
    .plugin(tauri_plugin_updater::Builder::new().build())
    // Reiniciar la app tras instalar una actualización
    .plugin(tauri_plugin_process::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
