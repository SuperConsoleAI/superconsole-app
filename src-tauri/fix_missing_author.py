import re
with open("src/agents.rs", "r") as f:
    content = f.read()

content = re.sub(r'(files: [^,}]+)(,?)\n\s*\}', r'\1,\n    author: String::new(),\n}', content)

with open("src/agents.rs", "w") as f:
    f.write(content)
