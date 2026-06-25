with open("src/lib.rs", "r") as f:
    content = f.read()

content = content.replace(
    "            None,\n        )?;",
    "            None,\n            None,\n            \"\",\n        )?;"
)

with open("src/lib.rs", "w") as f:
    f.write(content)
