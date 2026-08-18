const express = require('express');
const fs = require('fs');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

require('dotenv').config();

// Connects to Postgres using DATABASE_URL, creates the tasks table if
// missing, and seeds three example tasks only if the table is empty.
// Route bodies below still reference the old SQLite API for now — they
// get migrated to this repository in the next stages.
const repo = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Sample tasks used only by POST /reset to restore the original three tasks.
const sampleTasks = [
  { id: 1, title: 'Learn Express', done: 0 },
  { id: 2, title: 'Build a CRUD API', done: 0 },
  { id: 3, title: 'Read the assignment', done: 1 }
];

// Database-backed lookup + shaping, used by the migrated GET endpoints.
async function findTaskRow(taskId) {
  const { rows } = await repo.pool.query('SELECT * FROM tasks WHERE id = $1', [Number(taskId)]);
  return rows[0];
}

function toApiTask(row) {
  return { id: row.id, title: row.title, done: row.done };
}

function notFoundResponse(res, taskId) {
  return res.status(404).json({ error: `Task ${taskId} not found` });
}

/**
 * @openapi
 * /:
 *   get:
 *     summary: Describe the API
 *     responses:
 *       200:
 *         description: API information
 * /health:
 *   get:
 *     summary: Check API health
 *     responses:
 *       200:
 *         description: The API is healthy
 * /tasks:
 *   get:
 *     summary: List tasks with optional filtering, search, and pagination
 *     parameters:
 *       - in: query
 *         name: done
 *         schema: { type: boolean }
 *         description: Filter by completion status
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search titles case-insensitively
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 0 }
 *         description: Maximum number of tasks to return
 *       - in: query
 *         name: offset
 *         schema: { type: integer, minimum: 0, default: 0 }
 *         description: Number of matching tasks to skip
 *     responses:
 *       200:
 *         description: A list of tasks
 *   post:
 *     summary: Create a task
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/NewTask' }
 *     responses:
 *       201: { description: Task created }
 *       400: { description: Title is missing or empty }
 * /tasks/{id}:
 *   get:
 *     summary: Get one task
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *     responses:
 *       200: { description: The requested task }
 *       404: { description: Task not found }
 *   put:
 *     summary: Update a task
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/TaskUpdate' }
 *     responses:
 *       200: { description: Task updated }
 *       400: { description: Empty or invalid body }
 *       404: { description: Task not found }
 *   delete:
 *     summary: Delete a task
 *     parameters:
 *       - $ref: '#/components/parameters/TaskId'
 *     responses:
 *       204: { description: Task deleted }
 *       404: { description: Task not found }
 * /stats:
 *   get:
 *     summary: Get task statistics
 *     responses:
 *       200: { description: Total, done, and open task counts }
 * /reset:
 *   post:
 *     summary: Restore the three sample tasks
 *     responses:
 *       200: { description: Tasks restored }
 * components:
 *   parameters:
 *     TaskId:
 *       name: id
 *       in: path
 *       required: true
 *       schema: { type: integer }
 *       description: Task id
 *   schemas:
 *     Task:
 *       type: object
 *       required: [id, title, done]
 *       properties:
 *         id: { type: integer, example: 1 }
 *         title: { type: string, example: Buy milk }
 *         done: { type: boolean, example: false }
 *     NewTask:
 *       type: object
 *       required: [title]
 *       properties:
 *         title: { type: string, example: Buy milk }
 *     TaskUpdate:
 *       type: object
 *       properties:
 *         title: { type: string, example: Buy oat milk }
 *         done: { type: boolean, example: true }
 */
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Task API',
      version: '1.0',
      description: 'A SQLite-backed CRUD API for managing tasks.'
    },
    servers: [{ url: 'http://localhost:3000' }]
  },
  apis: [__filename]
};

const openapiDocument = swaggerJsdoc(swaggerOptions);
fs.writeFileSync('openapi.json', JSON.stringify(openapiDocument, null, 2));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiDocument));

app.get('/', (req, res) => {
  res.json({
    name: 'Task API',
    version: '1.0',
    endpoints: ['/tasks']
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/tasks', async (req, res, next) => {
  try {
    const clauses = [];
    const params = [];

    if (req.query.done !== undefined) {
      params.push(req.query.done === 'true');
      clauses.push(`done = $${params.length}`);
    }

    if (req.query.search) {
      params.push(`%${req.query.search}%`);
      clauses.push(`title ILIKE $${params.length}`);
    }

    let sql = 'SELECT * FROM tasks';
    if (clauses.length > 0) {
      sql += ` WHERE ${clauses.join(' AND ')}`;
    }
    sql += ' ORDER BY id';

    const offset = Number.parseInt(req.query.offset, 10) || 0;
    const limit = Number.parseInt(req.query.limit, 10);

    if (limit >= 0) {
      params.push(limit);
      sql += ` LIMIT $${params.length}`;
      params.push(offset);
      sql += ` OFFSET $${params.length}`;
    } else if (offset > 0) {
      params.push(offset);
      sql += ` OFFSET $${params.length}`;
    }

    const { rows } = await repo.pool.query(sql, params);
    res.json(rows.map(toApiTask));
  } catch (err) {
    next(err);
  }
});

app.get('/tasks/:id', async (req, res, next) => {
  try {
    const task = await findTaskRow(req.params.id);

    if (!task) {
      return notFoundResponse(res, req.params.id);
    }

    res.json(toApiTask(task));
  } catch (err) {
    next(err);
  }
});

app.post('/tasks', (req, res) => {
  const { title } = req.body;

  if (typeof title !== 'string') {
    return res.status(400).json({ error: 'Title is required' });
  }

  if (title.trim() === '') {
    return res.status(400).json({ error: 'Title cannot be empty' });
  }

  const result = db.prepare('INSERT INTO tasks (title, done) VALUES (?, 0)').run(title);
  const newTask = findTask(result.lastInsertRowid);

  res.status(201).json(toApiTask(newTask));
});

app.put('/tasks/:id', (req, res) => {
  const task = findTask(req.params.id);

  if (!task) {
    return notFoundResponse(res, req.params.id);
  }

  const updates = req.body;

  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    return res.status(400).json({ error: 'Request body must include title or done' });
  }

  const hasTitle = Object.prototype.hasOwnProperty.call(updates, 'title');
  const hasDone = Object.prototype.hasOwnProperty.call(updates, 'done');

  if (!hasTitle && !hasDone) {
    return res.status(400).json({ error: 'Request body must include title or done' });
  }

  if (hasTitle && (typeof updates.title !== 'string' || updates.title.trim() === '')) {
    return res.status(400).json({ error: 'Title must be a non-empty string' });
  }

  if (hasDone && typeof updates.done !== 'boolean') {
    return res.status(400).json({ error: 'Done must be a boolean' });
  }

  const nextTitle = hasTitle ? updates.title : task.title;
  const nextDone = hasDone ? (updates.done ? 1 : 0) : task.done;

  db.prepare('UPDATE tasks SET title = ?, done = ? WHERE id = ?').run(nextTitle, nextDone, task.id);

  res.json(toApiTask(findTask(task.id)));
});

app.delete('/tasks/:id', (req, res) => {
  const task = findTask(req.params.id);

  if (!task) {
    return notFoundResponse(res, req.params.id);
  }

  db.prepare('DELETE FROM tasks WHERE id = ?').run(task.id);
  res.status(204).send();
});

app.get('/stats', (req, res) => {
  const { total } = db.prepare('SELECT COUNT(*) AS total FROM tasks').get();
  const { done } = db.prepare('SELECT COUNT(*) AS done FROM tasks WHERE done = 1').get();

  res.json({ total, done, open: total - done });
});

app.post('/reset', (req, res) => {
  const resetAll = db.transaction(() => {
    db.prepare('DELETE FROM tasks').run();
    const insert = db.prepare('INSERT INTO tasks (id, title, done) VALUES (?, ?, ?)');
    sampleTasks.forEach((task) => insert.run(task.id, task.title, task.done));
  });

  resetAll();
  res.json(db.prepare('SELECT * FROM tasks ORDER BY id').all().map(toApiTask));
});

repo.init()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Task API running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize the database', err);
    process.exit(1);
  });

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});
