// src-tauri/src/commands/window.rs
//
// Window management commands — platform-aware fullscreen and window controls.
//
// Target platforms: macOS App Store, iOS, Android, Windows.

use tauri::WebviewWindow;

/// Toggle fullscreen in a platform-appropriate way.
#[tauri::command]
pub async fn toggle_fullscreen(#[allow(unused_variables)] window: WebviewWindow) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let is_full = window.is_fullscreen().map_err(|e| e.to_string())?;
        window.set_fullscreen(!is_full).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn app_minimize_window(#[allow(unused_variables)] window: WebviewWindow) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        window.minimize().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn app_toggle_maximize_window(#[allow(unused_variables)] window: WebviewWindow) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        if window.is_maximized().unwrap_or(false) {
            window.unmaximize().map_err(|e| e.to_string())?;
        } else {
            window.maximize().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn app_close_window(#[allow(unused_variables)] window: WebviewWindow) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn app_is_maximized(#[allow(unused_variables)] window: WebviewWindow) -> Result<bool, String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        window.is_maximized().map_err(|e| e.to_string())
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        Ok(true)
    }
}

/// Open a new native desktop window bound to a specific profile/project.
#[tauri::command]
pub async fn open_profile_window(
    #[allow(unused_variables)] app: tauri::AppHandle,
    #[allow(unused_variables)] profile_id: String,
    #[allow(unused_variables)] title: Option<String>,
) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        use tauri::{TitleBarStyle, WebviewUrl, WebviewWindowBuilder};

        let sanitized = profile_id.replace(|c: char| !c.is_alphanumeric() && c != '_' && c != '-', "");
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        let label = format!("win-{}-{}", sanitized, timestamp);
        let window_title = title.unwrap_or_else(|| "BusinessKit".to_string());
        let target_url = format!("/dashboard?switch={}", profile_id);

        let mut builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(target_url.into()))
            .title(&window_title)
            .inner_size(1280.0, 800.0)
            .min_inner_size(360.0, 400.0)
            .resizable(true)
            .decorations(true);

        #[cfg(target_os = "macos")]
        {
            builder = builder.title_bar_style(TitleBarStyle::Overlay).hidden_title(true);
        }

        let win = builder.build().map_err(|e| e.to_string())?;

        win.show().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

