const { Pool } = require('pg');

// Reads the connection string from the environment — never hardcoded.
// Locally this comes from .env; inside docker compose it's set directly
// on the api service and points at the db service by name.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const sampleTasks = [
  { title: 'Learn Express', done: false },
  { title: 'Build a CRUD API', done: false },
  { title: 'Read the assignment', done: true }
];

// Creates the tasks table if it doesn't exist, and seeds three example
// tasks only if the table is empty — the same first-run rule as A2.
async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      done BOOLEAN NOT NULL DEFAULT false
    )
  `);

  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM tasks');

  if (rows[0].count === 0) {
    for (const task of sampleTasks) {
      await pool.query('INSERT INTO tasks (title, done) VALUES ($1, $2)', [task.title, task.done]);
    }
  }
}

async function ping() {
  await pool.query('SELECT 1');
}

module.exports = { pool, init, ping, sampleTasks };
