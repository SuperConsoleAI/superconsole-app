const { createClient } = require("@libsql/client");

const client = createClient({
  url: "libsql://superconsole-superconsole.aws-us-east-1.turso.io",
  authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODE0MzUyNjIsImlkIjoiMDE5ZWM1Y2QtNzIwMS03NzRlLWE4MGMtNjNiODYxZDgwYjY2IiwicmlkIjoiNjQzMjgzYmQtZWFiZC00Y2RkLTg4NTQtN2Y5ZTk3NjdhMjA5In0.Or5MGh7YbHGyYax2ocrXATe5maZu-hsdK3MMOka6uNTOdfiMv0wiIrPjT9lyLC7jaM5GpZVMIkW8vhXTT2_cBQ",
});

async function run() {
  try {
    // 1. Update plugins table where mcp_url has supabase stdio corrupted
    const res = await client.execute(`SELECT id, mcp_url FROM plugins WHERE mcp_url LIKE '%supabase%'`);
    for (const row of res.rows) {
      let arr = JSON.parse(row.mcp_url);
      arr = arr.map(m => {
        if (m.id === 'supabase' && m.command === 'http') {
          return { id: "supabase", type: "http", url: m.args[0] };
        }
        return m;
      });
      await client.execute({
        sql: `UPDATE plugins SET mcp_url = ? WHERE id = ?`,
        args: [JSON.stringify(arr), row.id]
      });
      console.log(`Fixed plugin ${row.id}`);
    }
  } catch (e) {
    console.error(e);
  }
}
run();
