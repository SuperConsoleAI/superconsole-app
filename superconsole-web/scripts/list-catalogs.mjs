const URL = "https://superconsole-superconsole.aws-us-east-1.turso.io";
const TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODE0MzUyNjIsImlkIjoiMDE5ZWM1Y2QtNzIwMS03NzRlLWE4MGMtNjNiODYxZDgwYjY2IiwicmlkIjoiNjQzMjgzYmQtZWFiZC00Y2RkLTg4NTQtN2Y5ZTk3NjdhMjA5In0.Or5MGh7YbHGyYax2ocrXATe5maZu-hsdK3MMOka6uNTOdfiMv0wiIrPjT9lyLC7jaM5GpZVMIkW8vhXTT2_cBQ";

async function run() {
  const res = await fetch(`${URL}/v2/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ requests: [
      { type: "execute", stmt: { sql: "SELECT id FROM connector_catalog" } },
      { type: "execute", stmt: { sql: "SELECT id FROM mcp_catalog" } },
      { type: "execute", stmt: { sql: "SELECT id FROM commands_catalog" } },
      { type: "close" }
    ] }),
  });
  const json = await res.json();
  console.log("Connectors:", json.results[0]?.response?.result?.rows?.length);
  console.log("MCPs:", json.results[1]?.response?.result?.rows?.length);
  console.log("Commands:", json.results[2]?.response?.result?.rows?.length);
}
run();
