const express = require('express');

const app = express();
const PORT = 3000;

app.get('/', (req, res) => {
  res.send('Hello from Task API!');
});

app.listen(PORT, () => {
  console.log(`Task API running at http://localhost:${PORT}`);
});
