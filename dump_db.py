import json
import os

log_path = "/Users/2.o/.gemini/antigravity-ide/brain/ddb62bd2-3527-4a1b-b501-3da6b9c880d3/.system_generated/logs/transcript_full.jsonl"
if os.path.exists(log_path):
    with open(log_path, "r") as f:
        lines = f.readlines()
        
    for line in lines:
        if "upsert_plugin_cache" in line:
            data = json.loads(line)
            if data.get("type") == "TOOL_RESPONSE" and "sqlite" in line:
                content = data.get("content", "")
                if "fn upsert_plugin_cache" in content:
                    print("Found file dump!")
                    with open("db_backup.rs", "w") as out:
                        out.write(content)
                    break
