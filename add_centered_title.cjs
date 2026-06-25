const fs = require('fs');

let custom = fs.readFileSync('src/components/CustomizePage.tsx', 'utf8');

// Add relative to the top bar parent
custom = custom.replace(/<div className="flex h-10 shrink-0 items-center gap-2 border-b bg-card\/60 px-5">/, '<div className="flex h-10 shrink-0 items-center gap-2 border-b bg-card/60 px-5 relative">');

// Add centered project name right after the tab toggle pill div
custom = custom.replace(/<\/button>\n        <\/div>\n\n        <div className="ml-auto flex items-center gap-2">/, `</button>
        </div>

        {scope?.type === "project" && (
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 pointer-events-none">
            <span className="text-sm font-semibold">{wsName(scope.id)}</span>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">`);

fs.writeFileSync('src/components/CustomizePage.tsx', custom);
