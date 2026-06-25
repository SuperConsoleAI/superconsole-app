const fs = require('fs');

let rules = fs.readFileSync('src/components/RulesDialog.tsx', 'utf8');

// Header
rules = rules.replace(/<th className="px-4 py-2 font-medium text-xs text-muted-foreground">Rules<\/th>/, '<th className="px-4 py-2 font-medium text-xs text-muted-foreground w-full">Rules</th>');
rules = rules.replace(/<th className="px-4 py-2 font-medium text-xs text-muted-foreground">Author<\/th>/, '<th className="px-4 py-2 font-medium text-xs text-muted-foreground w-0 whitespace-nowrap text-right">Author</th>');
rules = rules.replace(/<th className="px-4 py-2 font-medium text-xs text-muted-foreground">Apply Always<\/th>/, '<th className="px-4 py-2 font-medium text-xs text-muted-foreground w-0 whitespace-nowrap text-center">Apply Always</th>');

// Body Author
rules = rules.replace(/<td className="px-4 py-3">\s*\{r\.author \? \([\s\S]*?<\/td>/, `<td className="px-4 py-3 w-0 whitespace-nowrap text-right">
                      {r.author ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <PluginIcon pluginId={r.author} className="h-4 w-4" />
                          <span className="text-xs font-medium">{r.author}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground block text-right">-</span>
                      )}
                    </td>`);

// Body Apply Always
rules = rules.replace(/<td className="px-4 py-3">\s*\{r\.always_apply \? \([\s\S]*?<\/td>/, `<td className="px-4 py-3 w-0 whitespace-nowrap text-center">
                      {r.always_apply ? (
                        <div className="flex justify-center"><Check className="h-4 w-4" /></div>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </td>`);

fs.writeFileSync('src/components/RulesDialog.tsx', rules);

