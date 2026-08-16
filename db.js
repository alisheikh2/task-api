const Database = require('better-sqlite3');

const db = new Database('tasks.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0
  )
`);

const sampleTasks = [
  { id: 1, title: 'Learn Express', done: 0 },
  { id: 2, title: 'Build a CRUD API', done: 0 },
  { id: 3, title: 'Read the assignment', done: 1 }
];

function seedIfEmpty() {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM tasks').get();

  if (count === 0) {
    const insert = db.prepare('INSERT INTO tasks (id, title, done) VALUES (?, ?, ?)');
    const seedAll = db.transaction((rows) => {
      rows.forEach((task) => insert.run(task.id, task.title, task.done));
    });
    seedAll(sampleTasks);
  }
}

seedIfEmpty();

module.exports = { db, sampleTasks };
