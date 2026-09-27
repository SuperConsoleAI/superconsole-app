## Rust Implementation

Add register_all() inside your single_instance closure to keep the plugin context active when a second link execution is triggered.

// src-tauri/src/lib.rsuse tauri::Manager;
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // Re-register links inside the single instance context
            let_ = tauri_plugin_deep_link::DeepLinkExt::deep_link(app).register_all();

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
            if let Some(url) = args.iter().find(|a| a.starts_with("businesskit://")) {
                let _ = app.emit("scheme-request-received", url);
            }
        }))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

------------------------------

## Qwik Component Implementation

Use Qwik's useVisibleTask$ to register the desktop event listeners directly inside the client browser context.

import { component$, useVisibleTask$, useStore } from '@builder.io/qwik';import { onOpenUrl, getCurrent } from '@tauri-apps/plugin-deep-link';import { listen } from '@tauri-apps/api/event';
export default component$(() => {
  const state = useStore({ inviteToken: '' });

  useVisibleTask$(() => {
    const parseToken = (urlString: string) => {
      try {
        const url = new URL(urlString);
        const token = url.searchParams.get('token');
        if (token) state.inviteToken = token;
      } catch (e) {
        console.error('URL parse failure:', urlString);
      }
    };

    // 1. App initialization payload check
    getCurrent().then((urls) => {
      if (urls?.length) parseToken(urls[0]);
    });

    // 2. Primary plugin execution listener
    const unlistenPlugin = onOpenUrl((urls) => {
      if (urls?.length) parseToken(urls[0]);
    });

    // 3. Fallback event emitter runtime trap
    const unlistenFallback = listen<string>('scheme-request-received', (event) => {
      if (event.payload) parseToken(event.payload);
    });

    // Teardown event listeners safely
    return () => {
      unlistenPlugin.then((unsub) => unsub());
      unlistenFallback.then((unsub) => unsub());
    };
  });

  return (
    <div>
      <h1>BusinessKit App</h1>
      {state.inviteToken && <p>Loaded Invite Token: {state.inviteToken}</p>}
    </div>
  );
});

Would you like assistance managing your internal Qwik routing layout logic based on this parsed parameter?
