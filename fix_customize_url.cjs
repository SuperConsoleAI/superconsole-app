const fs = require('fs');

let custom = fs.readFileSync('src/components/CustomizePage.tsx', 'utf8');

// Add useNavigate import
if (!custom.includes('useNavigate')) {
    custom = custom.replace(/import \{ useState, useEffect, useCallback \} from "react";/, 'import { useState, useEffect, useCallback } from "react";\nimport { useNavigate } from "@tanstack/react-router";');
}

// Add useNavigate hook inside CustomizePage
if (!custom.includes('const navigate = useNavigate();')) {
    custom = custom.replace(/export function CustomizePage\(\{ initialWorkspaceId \}: \{ initialWorkspaceId\?: number \}\) \{/, 'export function CustomizePage({ initialWorkspaceId }: { initialWorkspaceId?: number }) {\n  const navigate = useNavigate();');
}

// Intercept setScope calls to also update the URL
custom = custom.replace(/onClick=\{\(\) => setScope\(\{ type: "account", id: "account" \}\)\}/, 'onClick={() => { setScope({ type: "account", id: "account" }); navigate({ search: { ws: undefined }, replace: true }); }}');
custom = custom.replace(/onClick=\{\(\) => setScope\(\{ type: "org", id: String\(o\.id\) \}\)\}/g, 'onClick={() => { setScope({ type: "org", id: String(o.id) }); navigate({ search: { ws: undefined }, replace: true }); }}');
custom = custom.replace(/onClick=\{\(\) => setScope\(\{ type: "project", id: String\(w\.id\) \}\)\}/g, 'onClick={() => { setScope({ type: "project", id: String(w.id) }); navigate({ search: { ws: w.id }, replace: true }); }}');

fs.writeFileSync('src/components/CustomizePage.tsx', custom);
