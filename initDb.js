const pool = require('./db');

async function init() {
  try {
    // Drop old ghost tables
    await pool.query(`
      DROP TABLE IF EXISTS leads CASCADE;
      DROP TABLE IF EXISTS user_accounts CASCADE;
    `);

    // New table name: user_accounts
    await pool.query(`
      CREATE TABLE user_accounts (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE leads (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES user_accounts(id) ON DELETE CASCADE,
        company TEXT,
        contact TEXT,
        email TEXT,
        stage TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log("✅ user_accounts & leads tables created fresh!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Failed to initialize tables:", err);
    process.exit(1);
  }
}

init();
