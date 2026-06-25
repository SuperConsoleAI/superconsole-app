import { createClient } from "@libsql/client";

const client = createClient({
  url: "libsql://superconsole-superconsole.aws-us-east-1.turso.io",
  authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODE0MzUyNjIsImlkIjoiMDE5ZWM1Y2QtNzIwMS03NzRlLWE4MGMtNjNiODYxZDgwYjY2IiwicmlkIjoiNjQzMjgzYmQtZWFiZC00Y2RkLTg4NTQtN2Y5ZTk3NjdhMjA5In0.Or5MGh7YbHGyYax2ocrXATe5maZu-hsdK3MMOka6uNTOdfiMv0wiIrPjT9lyLC7jaM5GpZVMIkW8vhXTT2_cBQ",
});

async function run() {
  try {
    let res = await client.execute("PRAGMA table_info(plugins)");
    console.log("plugins schema:", res.rows);
    let res2 = await client.execute("PRAGMA table_info(installed_plugins)");
    console.log("installed_plugins schema:", res2.rows);
  } catch(e) {
    console.error(e);
  }
}
run();
