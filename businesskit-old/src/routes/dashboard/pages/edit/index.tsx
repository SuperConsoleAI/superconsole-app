/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// src/routes/dashboard/pages/edit/index.tsx
// Static SSG alias route for Pages Visual Builder — pre-renders dist/dashboard/pages/edit/index.html
// so desktop webview builds (.dmg) never 404 or redirect to /dashboard.

import PageEditor from "../[id]/edit/index";

export default PageEditor;
export { head } from "../[id]/edit/index";
