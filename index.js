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
  { title: 'Learn Express', done: false },
  { title: 'Build a CRUD API', done: false },
  { title: 'Read the assignment', done: true }
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
      description: 'A Postgres-backed CRUD API for managing tasks.'
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

app.get('/health', async (req, res) => {
  try {
    await repo.ping();
    res.json({ status: 'ok', db: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'ok', db: 'error' });
  }
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

app.post('/tasks', async (req, res, next) => {
  try {
    const { title } = req.body;

    if (typeof title !== 'string') {
      return res.status(400).json({ error: 'Title is required' });
    }

    if (title.trim() === '') {
      return res.status(400).json({ error: 'Title cannot be empty' });
    }

    const { rows } = await repo.pool.query(
      'INSERT INTO tasks (title, done) VALUES ($1, false) RETURNING *',
      [title]
    );

    res.status(201).json(toApiTask(rows[0]));
  } catch (err) {
    next(err);
  }
});

app.put('/tasks/:id', async (req, res, next) => {
  try {
    const task = await findTaskRow(req.params.id);

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
    const nextDone = hasDone ? updates.done : task.done;

    const { rows } = await repo.pool.query(
      'UPDATE tasks SET title = $1, done = $2 WHERE id = $3 RETURNING *',
      [nextTitle, nextDone, task.id]
    );

    res.json(toApiTask(rows[0]));
  } catch (err) {
    next(err);
  }
});

app.delete('/tasks/:id', async (req, res, next) => {
  try {
    const task = await findTaskRow(req.params.id);

    if (!task) {
      return notFoundResponse(res, req.params.id);
    }

    await repo.pool.query('DELETE FROM tasks WHERE id = $1', [task.id]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

app.get('/stats', async (req, res, next) => {
  try {
    const { rows } = await repo.pool.query(
      "SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE done)::int AS done FROM tasks"
    );
    const { total, done } = rows[0];

    res.json({ total, done, open: total - done });
  } catch (err) {
    next(err);
  }
});

app.post('/reset', async (req, res, next) => {
  try {
    const client = await repo.pool.connect();

    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM tasks');
      await client.query('ALTER SEQUENCE tasks_id_seq RESTART WITH 1');

      for (const task of sampleTasks) {
        await client.query('INSERT INTO tasks (title, done) VALUES ($1, $2)', [task.title, task.done]);
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const { rows } = await repo.pool.query('SELECT * FROM tasks ORDER BY id');
    res.json(rows.map(toApiTask));
  } catch (err) {
    next(err);
  }
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
