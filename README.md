# Task API

A beginner-friendly CRUD API built for the FlyRank Backend Internship Week 2 assignment. It manages an in-memory list of tasks with Express.js. Data is intentionally reset whenever the server restarts; no database is used.

## Requirements

- Node.js 18 or newer
- npm

## Installation

```bash
npm install
```

## Run

```bash
npm start
```

The server runs at `http://localhost:3000`.

## Endpoints

| Method | Endpoint | Description | Success | Errors |
| --- | --- | --- | --- | --- |
| GET | `/` | API information | 200 | — |
| GET | `/health` | Health check | 200 | — |
| GET | `/tasks` | List all tasks | 200 | — |
| GET | `/tasks/:id` | Get one task | 200 | 404 |
| POST | `/tasks` | Create a task | 201 | 400 |
| PUT | `/tasks/:id` | Update a task title and/or completion status | 200 | 400, 404 |
| DELETE | `/tasks/:id` | Delete a task | 204 | 404 |
| GET | `/docs` | Interactive Swagger UI documentation | 200 | — |

## Example curl requests

List tasks:

```bash
curl -i http://localhost:3000/tasks
```

Create a task:

```bash
curl -i -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Buy milk"}'
```

Example response:

```text
HTTP/1.1 201 Created
Content-Type: application/json; charset=utf-8

{"id":4,"title":"Buy milk","done":false}
```

Update a task:

```bash
curl -i -X PUT http://localhost:3000/tasks/4 \
  -H "Content-Type: application/json" \
  -d '{"done":true}'
```

Delete a task:

```bash
curl -i -X DELETE http://localhost:3000/tasks/4
```

## Swagger UI

Open [http://localhost:3000/docs](http://localhost:3000/docs) while the server is running. Use **Try it out** to complete the full CRUD cycle without curl.

![Swagger UI](screenshots/swagger.png)

## Folder structure

```text
task-api/
├── package.json
├── package-lock.json
├── index.js
├── openapi.json
├── README.md
└── screenshots/
    └── swagger.png
```

## Validation and status codes

- New tasks require a non-empty `title`; invalid input returns `400`.
- Updates must include `title` and/or `done`; empty or invalid input returns `400`.
- Unknown task ids return `404` with a JSON error.
- Successful creation returns `201`.
- Successful deletion returns `204` with no response body.
