const fs = require('fs');

['src/components/RulesDialog.tsx', 'src/components/CommandDialog.tsx'].forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    
    // Add p-4 to DialogContent
    content = content.replace(/<DialogContent className="flex max-h-\[90vh\] max-w-2xl flex-col overflow-hidden">/, '<DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden p-4">');
    
    // Remove p-4 from the inner div
    content = content.replace(/className="flex flex-col gap-3 p-4"/, 'className="flex flex-col gap-3"');
    
    fs.writeFileSync(file, content);
});
