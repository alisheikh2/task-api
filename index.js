const express = require('express');
const fs = require('fs');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

// Opens (and creates if missing) tasks.db, creates the tasks table if it
// doesn't exist, and seeds three example tasks only if the table is empty.
const { db } = require('./db');

const app = express();
const PORT = 3000;

app.use(express.json());

// POST/PUT/DELETE still use this in-memory array for now — only the read
// endpoints below have been migrated to the database in this stage.
const sampleTasks = [
  { id: 1, title: 'Learn Express', done: false },
  { id: 2, title: 'Build a CRUD API', done: false },
  { id: 3, title: 'Read the assignment', done: true }
];

const tasks = sampleTasks.map((task) => ({ ...task }));

function findTask(taskId) {
  return tasks.find((task) => task.id === Number(taskId));
}

// Database-backed lookup + shaping, used by the migrated GET endpoints.
function findTaskRow(taskId) {
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(Number(taskId));
}

function toApiTask(row) {
  return { id: row.id, title: row.title, done: Boolean(row.done) };
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
      description: 'A simple in-memory CRUD API for managing tasks.'
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

app.get('/tasks', (req, res) => {
  const clauses = [];
  const params = [];

  if (req.query.done !== undefined) {
    clauses.push('done = ?');
    params.push(req.query.done === 'true' ? 1 : 0);
  }

  if (req.query.search) {
    clauses.push('title LIKE ? COLLATE NOCASE');
    params.push(`%${req.query.search}%`);
  }

  let sql = 'SELECT * FROM tasks';
  if (clauses.length > 0) {
    sql += ` WHERE ${clauses.join(' AND ')}`;
  }
  sql += ' ORDER BY id';

  const offset = Number.parseInt(req.query.offset, 10) || 0;
  const limit = Number.parseInt(req.query.limit, 10);

  if (limit >= 0) {
    sql += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);
  } else if (offset > 0) {
    sql += ' LIMIT -1 OFFSET ?';
    params.push(offset);
  }

  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(toApiTask));
});

app.get('/tasks/:id', (req, res) => {
  const task = findTaskRow(req.params.id);

  if (!task) {
    return notFoundResponse(res, req.params.id);
  }

  res.json(toApiTask(task));
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
  const newTask = findTaskRow(result.lastInsertRowid);

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

  if (hasTitle) task.title = updates.title;
  if (hasDone) task.done = updates.done;

  res.json(task);
});

app.delete('/tasks/:id', (req, res) => {
  const taskIndex = tasks.findIndex((task) => task.id === Number(req.params.id));

  if (taskIndex === -1) {
    return notFoundResponse(res, req.params.id);
  }

  tasks.splice(taskIndex, 1);
  res.status(204).send();
});

app.get('/stats', (req, res) => {
  const done = tasks.filter((task) => task.done).length;
  res.json({ total: tasks.length, done, open: tasks.length - done });
});

app.post('/reset', (req, res) => {
  tasks.splice(0, tasks.length, ...sampleTasks.map((task) => ({ ...task })));
  res.json(tasks);
});

app.listen(PORT, () => {
  console.log(`Task API running at http://localhost:${PORT}`);
});
