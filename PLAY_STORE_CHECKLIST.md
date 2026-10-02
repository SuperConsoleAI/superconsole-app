# SuperConsole — Google Play Store Submission Checklist

Use this checklist before releasing or submitting builds to the Google Play Console.

---

## 1. Build & Version Configuration

- [ ] Package name in `tauri.conf.json` is `com.superconsole.app` (matches Google Play Console application ID).
- [ ] `versionCode` in `src-tauri/gen/android/app/build.gradle.kts` incremented strictly monotonically (e.g. 4 -> 5).
- [ ] `targetSdkVersion` set to 36 (Android 15+) meeting current Google Play developer standards.
- [ ] Release builds generated in `.aab` (Android App Bundle) format for Google Play distribution.
- [ ] Release signing configured via `key.properties` / GitHub secret `ANDROID_KEYSTORE_BASE64`.

---

## 2. Mobile Platform Runtime Constraints

- [ ] **Terminal / PTY is desktop-exclusive**: Mobile operating systems do not support spawning local interactive PTY sessions. On mobile, SuperConsole powers native AI Chat, Connectors, LocalDB Studio, and background job inspection.
- [ ] **No Self-Updater on Android**: `updater` permissions are restricted to desktop platforms in [`src-tauri/capabilities/desktop.json`](src-tauri/capabilities/desktop.json) so the Android app never violates Google Play's policy against third-party binary updates.
- [ ] **Encrypted Storage**: Secrets and keys are AES-256-GCM encrypted and stored in app-private SQLite storage.

---

## 3. Play Console Policy & Declarations

- [ ] **Category**: Set to **Productivity** or **Business**.
- [ ] **Data Safety**:
  - Offline mode (`go_local = 1`): zero user data transferred off-device.
  - Cloud mode: declare WorkOS authentication and Turso database synchronization.
- [ ] **Advertising ID**: Declare "No" (SuperConsole contains no advertising SDKs or tracking identifiers).
- [ ] **Financial Features**: Declare "No" (SuperConsole is a developer & agent workspace, not a lending or financial services app).
- [ ] **Privacy Policy**: Ensure live URL is provided in the Store Listing settings.

---

## 4. Required GitHub Secrets for CI/CD Play Store Automation

To enable automatic Google Play internal track uploads on GitHub Actions:

| Secret Name | Purpose |
| :--- | :--- |
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded release `.jks` or `.keystore` file |
| `ANDROID_KEYSTORE_PASSWORD` | Password for the release keystore |
| `ANDROID_KEY_ALIAS` | Key alias name inside the keystore |
| `ANDROID_KEY_PASSWORD` | Password for the key alias |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Google Cloud Service Account JSON key authorized for Play Console API |
