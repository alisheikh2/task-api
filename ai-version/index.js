const express = require('express');

const app = express();
const PORT = 3001;

app.use(express.json());

const tasks = [
  { id: 1, title: 'Learn Express', done: false },
  { id: 2, title: 'Build a CRUD API', done: false },
  { id: 3, title: 'Read the assignment', done: true }
];

app.get('/', (req, res) => {
  res.json({ name: 'Task API', version: '1.0', endpoints: ['/tasks'] });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/tasks', (req, res) => {
  res.json(tasks);
});

app.get('/tasks/:id', (req, res) => {
  const task = tasks.find((item) => item.id === Number(req.params.id));

  if (!task) {
    return res.status(404).json({ error: `Task ${req.params.id} not found` });
  }

  res.json(task);
});

app.post('/tasks', (req, res) => {
  if (typeof req.body.title !== 'string' || req.body.title.trim() === '') {
    return res.status(400).json({ error: 'Title is required and cannot be empty' });
  }

  const task = {
    id: tasks.length === 0 ? 1 : Math.max(...tasks.map((item) => item.id)) + 1,
    title: req.body.title,
    done: false
  };

  tasks.push(task);
  res.status(201).json(task);
});

app.put('/tasks/:id', (req, res) => {
  const task = tasks.find((item) => item.id === Number(req.params.id));

  if (!task) {
    return res.status(404).json({ error: `Task ${req.params.id} not found` });
  }

  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).json({ error: 'Request body cannot be empty' });
  }

  if (req.body.title !== undefined) {
    if (typeof req.body.title !== 'string' || req.body.title.trim() === '') {
      return res.status(400).json({ error: 'Title must be a non-empty string' });
    }
    task.title = req.body.title;
  }

  if (req.body.done !== undefined) {
    if (typeof req.body.done !== 'boolean') {
      return res.status(400).json({ error: 'Done must be a boolean' });
    }
    task.done = req.body.done;
  }

  res.json(task);
});

app.delete('/tasks/:id', (req, res) => {
  const index = tasks.findIndex((item) => item.id === Number(req.params.id));

  if (index === -1) {
    return res.status(404).json({ error: `Task ${req.params.id} not found` });
  }

  tasks.splice(index, 1);
  res.status(204).send();
});

app.listen(PORT, () => {
  console.log(`AI version running at http://localhost:${PORT}`);
});
