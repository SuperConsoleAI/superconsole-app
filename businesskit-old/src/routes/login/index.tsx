// src/routes/login/index.tsx
//
// WHAT:  WorkOS AuthKit login screen.
// HOW:
//   1. On mount: call auth_status() — if session exists → /dashboard
//   2. "Sign in" → invoke('sign_in') → Rust starts loopback on port 4666
//                                    → returns WorkOS auth URL
//                                    → frontend opens URL with shell:open
//   3. User signs in in browser → WorkOS redirects to localhost:4666/callback
//   4. Rust receives code, exchanges for token, stores in keychain
//   5. Rust emits 'auth-changed' event → frontend navigates to /dashboard
//
// Register in WorkOS dashboard: http://localhost:4666/callback

import { $, component$, useSignal, useVisibleTask$ } from "@builder.io/qwik";
import { useNavigate, type DocumentHead } from "@builder.io/qwik-city";
import { listen } from "@tauri-apps/api/event";
import { authStatus, signIn } from "~/lib/ipc";
import type { AuthInfo } from "~/lib/types";
import { LuLoader2 } from "@qwikest/icons/lucide";
import { version } from "../../../package.json";
import businesskitIcon from "~/assets/businesskit-icon.svg?url";

export default component$(() => {
  const nav = useNavigate();
  const loading = useSignal(true);
  const signingIn = useSignal(false);
  const error = useSignal<string | null>(null);
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ cleanup }) => {
    const navigateAfterAuth = async () => {
      try {
        const { getProjects } = await import("~/lib/ipc");
        let projects = await getProjects().catch(() => []);
        if (projects.length === 0) {
          await new Promise((r) => setTimeout(r, 250));
          projects = await getProjects().catch(() => []);
        }
        if (projects.length === 0) {
          if (typeof localStorage !== "undefined") {
            localStorage.removeItem("bk-active-profile");
          }
          if (typeof sessionStorage !== "undefined") {
            sessionStorage.removeItem("bk-window-profile");
          }
          nav("/onboarding", { replaceState: true });
        } else {
          nav("/dashboard", { replaceState: true });
        }
      } catch {
        if (typeof localStorage !== "undefined") {
          localStorage.removeItem("bk-active-profile");
        }
        nav("/onboarding", { replaceState: true });
      }
    };

    try {
      // auth_status() reads keychain — instant, no network
      const info = await authStatus();
      if (info) {
        await navigateAfterAuth();
        return;
      }
    } catch {
      // not authenticated — show login
    } finally {
      loading.value = false;
    }

    // Listen for auth-changed event (Rust fires after successful login)
    const unlisten = await listen<AuthInfo>("auth-changed", async () => {
      unlisten();
      await navigateAfterAuth();
    });

    // Listen for auth errors from Rust
    const unlistenErr = await listen<string>("auth-error", (event) => {
      error.value = event.payload;
      signingIn.value = false;
    });

    cleanup(() => {
      unlisten();
      unlistenErr();
    });
  });

  const handleAuth = $(async (hint: "sign-in" | "sign-up" = "sign-in") => {
    error.value = null;
    signingIn.value = true;
    try {
      await signIn(hint);
    } catch (e) {
      error.value = String(e);
      signingIn.value = false;
    }
  });

  if (loading.value) {
    return (
      <div style="display:flex;align-items:center;justify-content:center;height:100vh;background:var(--surface-1)">
        <div class="spinner" />
      </div>
    );
  }

  return (
    <div class="auth-screen">
      <div class="auth-card">
        {/* Logo */}
        <div class="auth-logo" style="display:flex;align-items:center;justify-content:center;gap:0.625rem;margin-bottom:1.5rem">
          <img
            src={businesskitIcon}
            alt="BusinessKit"
            width={36}
            height={36}
            style="width:36px;height:36px;border-radius:var(--radius-sm);object-fit:cover;flex-shrink:0"
          />
          <span style="font-size:1.125rem;font-weight:700;color:var(--text-primary);letter-spacing:-0.02em">
            BusinessKit
          </span>
        </div>

        <h1 style="font-size:1.5rem;font-weight:700;letter-spacing:-0.03em;color:var(--text-primary);margin-bottom:6px;text-align:center">
          Welcome back
        </h1>
        <p style="font-size:0.875rem;color:var(--text-secondary);margin-bottom:28px;line-height:1.6;text-align:center">
          Sign in to continue managing your business tools.
        </p>

        {error.value && (
          <div class="error-banner" style="margin-bottom:16px">
            <span>{error.value}</span>
          </div>
        )}

        <button
          class="btn btn-primary btn-lg w-full"
          onClick$={() => handleAuth("sign-in")}
          disabled={signingIn.value}
          style="font-size:0.9375rem;border-radius:var(--radius-sm)"
        >
          {signingIn.value ? (
            <>
              <LuLoader2 style="width:16px;height:16px;animation:spin 0.7s linear infinite" />
              Opening browser…
            </>
          ) : (
            "Sign in with WorkOS"
          )}
        </button>

        <div style="margin-top:16px;text-align:center">
          <span style="font-size:0.875rem;color:var(--text-secondary)">Don't have an account? </span>
          <button
            type="button"
            style="background:none;border:none;color:var(--accent);font-size:0.875rem;font-weight:600;cursor:pointer;padding:0;text-decoration:underline"
            onClick$={() => handleAuth("sign-up")}
            disabled={signingIn.value}
          >
            Sign up
          </button>
        </div>

        <p style="margin-top:24px;text-align:center;font-size:0.75rem;color:var(--text-muted)">
          A browser window opens on port 4666 for authentication.
          <br />Return here after signing in.
        </p>
      </div>

      <div style="position:fixed;bottom:16px;left:0;right:0;text-align:center;font-size:0.75rem;color:var(--text-muted)">
        BusinessKit v{version}
      </div>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Sign In — BusinessKit",
};
