const { Client } = require('pg');

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/eden'
  });
  
  try {
    await client.connect();
    const res = await client.query('SELECT id, title, kind, user_id FROM pages');
    console.log('--- PAGES ---');
    console.table(res.rows);
    
    const res2 = await client.query('SELECT id, email FROM users');
    console.log('--- USERS ---');
    console.table(res2.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
