const fs = require('fs');

let custom = fs.readFileSync('src/components/CustomizePage.tsx', 'utf8');

// Add ArrowRight import
if (!custom.includes('ArrowRight')) {
    custom = custom.replace(/Trash2,/, 'Trash2,\n  ArrowRight,');
}

// Add state
custom = custom.replace(/const \[addRuleOpen, setAddRuleOpen\] = useState<any>\(null\);/, `const [addRuleOpen, setAddRuleOpen] = useState<any>(null);
  const [showPointer, setShowPointer] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setShowPointer(false), 5000);
    return () => clearTimeout(t);
  }, []);`);

// Add UI before DropdownMenu
custom = custom.replace(/<DropdownMenu>/, `{showPointer && (
            <div className="flex items-center gap-1.5 text-xs text-primary animate-pulse mr-1">
              <span className="font-medium">Select a project</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </div>
          )}
          <DropdownMenu>`);

fs.writeFileSync('src/components/CustomizePage.tsx', custom);
