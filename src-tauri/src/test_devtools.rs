use tauri::{AppHandle, Manager, Webview};
fn test(app: AppHandle) {
    if let Some(webview) = app.get_webview("test") {
        #[cfg(debug_assertions)]
        webview.open_devtools();
    }
}
