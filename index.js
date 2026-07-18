const express = require('express');

const app = express();
const PORT = 3000;

app.use(express.json());

const tasks = [
  { id: 1, title: 'Learn Express', done: false },
  { id: 2, title: 'Build a CRUD API', done: false },
  { id: 3, title: 'Read the assignment', done: true }
];

function findTask(taskId) {
  return tasks.find((task) => task.id === Number(taskId));
}

function notFoundResponse(res, taskId) {
  return res.status(404).json({ error: `Task ${taskId} not found` });
}

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
  res.json(tasks);
});

app.get('/tasks/:id', (req, res) => {
  const task = findTask(req.params.id);

  if (!task) {
    return notFoundResponse(res, req.params.id);
  }

  res.json(task);
});

app.post('/tasks', (req, res) => {
  const { title } = req.body;

  if (typeof title !== 'string') {
    return res.status(400).json({ error: 'Title is required' });
  }

  if (title.trim() === '') {
    return res.status(400).json({ error: 'Title cannot be empty' });
  }

  const nextId = tasks.length === 0
    ? 1
    : Math.max(...tasks.map((task) => task.id)) + 1;
  const newTask = { id: nextId, title, done: false };

  tasks.push(newTask);
  res.status(201).json(newTask);
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

app.listen(PORT, () => {
  console.log(`Task API running at http://localhost:${PORT}`);
});
