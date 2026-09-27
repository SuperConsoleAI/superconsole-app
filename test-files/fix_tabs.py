import re

with open("src/components/CustomizePage.tsx", "r") as f:
    content = f.read()

# The section we want to reorder is between:
#         <div className="flex gap-0.5 rounded-lg border bg-background p-0.5 shrink-0">
# and
#         </div>
# 
#         {portalNode ? (

start_idx = content.find('<div className="flex gap-0.5 rounded-lg border bg-background p-0.5 shrink-0">')
end_idx = content.find('</div>', start_idx + 1)
end_idx = content.find('</div>\n\n        {portalNode ? (', start_idx)

if start_idx != -1 and end_idx != -1:
    section = content[start_idx:end_idx]
    
    # Extract all button blocks
    buttons = re.findall(r'<button\s+onClick=\{\(\) => setTab\("[^"]+"\)\}.*?</button>', section, re.DOTALL)
    
    # We expect 11 buttons
    button_dict = {}
    for b in buttons:
        match = re.search(r'setTab\("([^"]+)"\)', b)
        if match:
            button_dict[match.group(1)] = b
            
    # Define new order
    new_order = [
        "plugins",
        "connectors",
        "skills",
        "commands",
        "hooks",
        "rules",
        "mcp",
        "context",
        "wiki",
        "memory",
        "sessions"
    ]
    
    new_buttons_str = "\n          ".join([button_dict[k] for k in new_order if k in button_dict])
    
    # Replace section
    prefix = content[:start_idx + len('<div className="flex gap-0.5 rounded-lg border bg-background p-0.5 shrink-0">\n          ')]
    suffix = content[end_idx:]
    
    with open("src/components/CustomizePage.tsx", "w") as f:
        f.write(content[:start_idx + len('<div className="flex gap-0.5 rounded-lg border bg-background p-0.5 shrink-0">\n          ')] + new_buttons_str + "\n        " + suffix)
    print("Successfully reordered tabs")
else:
    print("Could not find section")
