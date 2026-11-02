//! Guardar la página actual como PDF con el motor de impresión de WebView2.
//! El resultado es un PDF de verdad (texto seleccionable), igual que al imprimir.

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfOptions {
  pub path: String,
  /// Tamaño del papel y márgenes, en pulgadas
  pub width: f64,
  pub height: f64,
  pub margin: f64,
}

#[cfg(windows)]
#[tauri::command]
pub async fn print_to_pdf(webview: tauri::Webview, options: PdfOptions) -> Result<(), String> {
  use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2Environment6, ICoreWebView2_7, COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT,
  };
  use webview2_com::PrintToPdfCompletedHandler;
  use windows::core::{Interface, HSTRING};

  let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
  let tx_err = tx.clone();
  webview
    .with_webview(move |platform| {
      let run = || -> Result<(), String> {
        unsafe {
          let core = platform.controller().CoreWebView2().map_err(|e| e.to_string())?;
          let core7: ICoreWebView2_7 = core.cast().map_err(|_| "Esta versión de WebView2 no puede guardar PDF".to_string())?;
          let env6: ICoreWebView2Environment6 = platform.environment().cast().map_err(|e| e.to_string())?;
          let settings = env6.CreatePrintSettings().map_err(|e| e.to_string())?;
          settings.SetOrientation(COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT).map_err(|e| e.to_string())?;
          settings.SetPageWidth(options.width).map_err(|e| e.to_string())?;
          settings.SetPageHeight(options.height).map_err(|e| e.to_string())?;
          for m in [
            settings.SetMarginTop(options.margin),
            settings.SetMarginBottom(options.margin),
            settings.SetMarginLeft(options.margin),
            settings.SetMarginRight(options.margin),
          ] {
            m.map_err(|e| e.to_string())?;
          }
          settings.SetShouldPrintBackgrounds(true).map_err(|e| e.to_string())?;
          settings.SetShouldPrintHeaderAndFooter(false).map_err(|e| e.to_string())?;
          let tx = tx.clone();
          let handler = PrintToPdfCompletedHandler::create(Box::new(move |result, ok| {
            let _ = tx.send(match result {
              Err(e) => Err(e.to_string()),
              Ok(()) if !ok => Err("No se pudo crear el PDF".to_string()),
              Ok(()) => Ok(()),
            });
            Ok(())
          }));
          core7
            .PrintToPdf(&HSTRING::from(options.path.as_str()), &settings, &handler)
            .map_err(|e| e.to_string())?;
        }
        Ok(())
      };
      if let Err(e) = run() {
        let _ = tx_err.send(Err(e));
      }
    })
    .map_err(|e| e.to_string())?;
  // Se espera (fuera del hilo principal) a que WebView2 termine de escribir el archivo
  tauri::async_runtime::spawn_blocking(move || rx.recv().unwrap_or(Err("No se pudo crear el PDF".to_string())))
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn print_to_pdf(_options: PdfOptions) -> Result<(), String> {
  Err("Guardar en PDF solo está disponible en Windows".to_string())
}
