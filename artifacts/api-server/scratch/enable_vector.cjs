const { Client } = require('pg');
require('dotenv').config();

async function main() {
  const client = new Client(process.env.DATABASE_URL);
  await client.connect();
  try {
    console.log("Enabling pgvector extension...");
    await client.query("CREATE EXTENSION IF NOT EXISTS vector;");
    console.log("pgvector extension enabled successfully.");
    
    const res = await client.query("SELECT extname FROM pg_extension WHERE extname = 'vector';");
    console.log("Current extensions:", res.rows);
  } catch (err) {
    console.error("Error enabling extension:", err);
  } finally {
    await client.end();
  }
}

main();
