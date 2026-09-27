Before making any more changes, isolate the actual cause instead of guessing:

1. Run: git diff HEAD~<N> -- src-tauri/tauri.conf.json (however many commits back to before
   Task 4 was applied). Show me the exact csp and assetProtocol.scope values before and after.

2. Temporarily set csp back to null and assetProtocol.scope back to ["**"] — the original
   pre-Task-4 values — and rebuild. Does the build work again?

3. If yes: the CSP/scope IS the cause. Now re-apply the strict csp and scope ONE AT A TIME
   (csp first, rebuild, test; then scope, rebuild, test) so we know which one broke it, not both
   at once.

4. If no (still broken even reverted to original values): the cause is unrelated to Task 4 —
   check what else changed. Run git log --oneline since the last known-good build and list every
   commit touching tauri.conf.json, vite.config.ts, or anything in src-tauri/gen/.

5. Once the exact breaking change is identified, show me the console error from the built app
   BEFORE proposing any fix. Do not touch Android-specific config again until this desktop/current
   build issue is confirmed fixed — one platform at a time, verified working, before moving to
   the next.

Report back with the isolated cause before applying any new fix.
