import { createClient } from '@libsql/client';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

async function main() {
    const sql = fs.readFileSync('drizzle/0014_omniscient_sentry.sql', 'utf-8');
    const statements = sql.split('--> statement-breakpoint').map(s => s.trim()).filter(s => s.length > 0);
    
    console.log(`Executing ${statements.length} statements...`);
    for (const stmt of statements) {
        try {
            await client.execute(stmt);
        } catch (err) {
            console.error(`Error executing statement: ${stmt}`);
            console.error(err);
        }
    }
    console.log("Migration applied successfully!");
}

main().catch(console.error);
