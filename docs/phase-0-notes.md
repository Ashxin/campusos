# CampusOS — Phase 0 Notes
### Authentication, JWT, PostgreSQL, and Express
> Personal learning notes — built as part of CampusOS Student Success Hub project

---

## Table of Contents
1. [The Mental Model](#1-the-mental-model)
2. [What is a Server?](#2-what-is-a-server)
3. [What is Express?](#3-what-is-express)
4. [What is JWT?](#4-what-is-jwt)
5. [What is PostgreSQL?](#5-what-is-postgresql)
6. [Project Setup](#6-project-setup)
7. [Dependencies Explained](#7-dependencies-explained)
8. [Database — Users Table](#8-database--users-table)
9. [File by File Breakdown](#9-file-by-file-breakdown)
10. [API Endpoints](#10-api-endpoints)
11. [Testing Results](#11-testing-results)
12. [Mistakes Made and Lessons Learned](#12-mistakes-made-and-lessons-learned)
13. [Phase 0 Checkpoint — Deep Answers](#13-phase-0-checkpoint--deep-answers)

---

## 1. The Mental Model

Before writing any code, understand what you're building and why.

The entire backend follows one loop:

```
Client sends HTTP Request
→ Server receives it
→ Server processes it (validates, queries DB, etc.)
→ Server sends back HTTP Response
→ Client uses the response
```

Everything else — middleware, routes, JWT, database queries — is just detail layered on top of this loop.

---

## 2. What is a Server?

A server is a program that **listens** for requests and **responds** to them.

When you open a website:
```
You type campusos.com
→ Browser sends HTTP Request to the server
→ Server processes it
→ Server sends back HTTP Response
→ Browser renders it
```

Node.js lets you run JavaScript outside the browser — meaning you can write the server itself in JavaScript.

---

## 3. What is Express?

Express is a thin wrapper around Node's built-in HTTP module. It makes writing servers readable.

**Without Express (raw Node — verbose and painful):**
```js
const http = require('http')
http.createServer((req, res) => {
  if (req.url === '/login' && req.method === 'POST') {
    // painful manual parsing...
  }
})
```

**With Express (clean and readable):**
```js
app.post('/login', (req, res) => {
  // req = what the user sent
  // res = what you send back
})
```

Same result. Express just gets out of your way.

---

## 4. What is JWT?

HTTP is **stateless** — it forgets everything between requests. JWT solves the "who are you?" problem.

**The flow:**
```
1. User logs in with email + password
2. Server verifies credentials
3. Server creates a signed token (JWT)
   Token payload: { userId: 3, role: "student" }
4. Server sends token back to client
5. Client stores it, sends it with every future request
   Header: Authorization: Bearer <token>
6. Server reads token → knows who you are without hitting DB again
```

**The analogy:** JWT is a signed hall pass. Anyone can read it, but only the server can issue one that's trusted — because it's signed with a secret key only the server knows.

**What's inside a JWT:**
```json
{
  "userId": 1,
  "role": "student",
  "iat": 1779702379,
  "exp": 1780307179
}
```

`iat` = issued at (Unix timestamp)
`exp` = expiry (7 days later in this project)

**What is NOT in the JWT:** password, password_hash, email. Never put sensitive data in a token — the payload is base64 encoded, not encrypted. Anyone can decode it.

**401 vs 403:**
- `401 Unauthorized` → No token at all. "I don't know who you are."
- `403 Forbidden` → Token exists but is invalid or expired. "I know who you are, but you're not allowed."

---

## 5. What is PostgreSQL?

A relational database. Think of it as Excel on steroids with enforced rules.

- Data lives in **tables**
- Tables connect via **foreign keys**
- The database **enforces constraints** — you can't insert bad data even if your code has bugs

**Why PostgreSQL for this project (not MongoDB):**
CampusOS has strict relationships — students belong to sections, sections belong to courses, courses belong to semesters. These relationships need to be enforced at the data layer, not just the application layer. PostgreSQL handles this with foreign keys and constraints.

---

## 6. Project Setup

### Folder Structure
```
campusos-backend/
├── src/
│   ├── config/
│   │   └── db.js          ← database connection pool
│   ├── middleware/
│   │   └── auth.js        ← JWT verification middleware
│   ├── routes/
│   │   └── auth.js        ← register and login endpoints
│   └── index.js           ← entry point, mounts routes
├── .env                   ← secrets (never commit)
├── .gitignore
└── package.json
```

### Install Commands
```bash
mkdir campusos-backend
cd campusos-backend
npm init -y
npm install express pg bcryptjs jsonwebtoken dotenv
npm install --save-dev nodemon
```

### package.json scripts
```json
"scripts": {
  "dev": "nodemon src/index.js",
  "start": "node src/index.js"
}
```

### .gitignore
```
node_modules
.env
```

**Why these are ignored:**
- `node_modules` — 100MB+ of packages. Anyone can reinstall with `npm install`. Never commit it.
- `.env` — contains your passwords and secrets. Committing this exposes your database to the public internet.

---

## 7. Dependencies Explained

| Package | Purpose |
|---|---|
| `express` | Web server framework |
| `pg` | PostgreSQL client for Node.js — talks to your database |
| `bcryptjs` | Hashes passwords — one-way, cannot be reversed |
| `jsonwebtoken` | Creates and verifies JWTs |
| `dotenv` | Loads `.env` file into `process.env` |
| `nodemon` | Dev tool — restarts server automatically on file save |

---

## 8. Database — Users Table

### Create the database
```sql
CREATE DATABASE campusos;
\c campusos
```

### Create the users table
```sql
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          VARCHAR(20) NOT NULL CHECK (role IN ('student', 'faculty', 'admin')),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### What every part means

| Part | What it does |
|---|---|
| `SERIAL PRIMARY KEY` | Auto-incrementing unique ID. PostgreSQL manages this via a sequence. |
| `VARCHAR(255) UNIQUE NOT NULL` | Max 255 chars, no duplicates allowed, cannot be empty |
| `TEXT NOT NULL` | Unlimited length text, cannot be empty. Bcrypt hashes are always 60 chars. |
| `CHECK (role IN (...))` | DB physically rejects any value outside this list |
| `TIMESTAMPTZ DEFAULT NOW()` | Auto-filled with current time on insert. You never pass this manually. |

### The CHECK constraint — why it matters

Your Node code validates the role. So why does the DB also validate it?

**Defence in depth.** Your code can have bugs. Someone might bypass your API and write directly to the DB. A future developer might forget to add validation. The constraint means the database is the last line of defence — bad data physically cannot enter regardless of what happens above it.

This is the difference between a junior answer ("it rejects invalid roles") and a senior answer ("it's defence in depth — the DB enforces integrity independently of the application layer").

---

## 9. File by File Breakdown

### `src/config/db.js`
```js
const { Pool } = require('pg')
require('dotenv').config()

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
})

pool.connect((err) => {
  if (err) {
    console.error('Database connection failed:', err.message)
  } else {
    console.log('Connected to PostgreSQL')
  }
})

module.exports = pool
```

**Key concepts:**
- `Pool` — keeps multiple DB connections open and ready. Faster than opening/closing a connection per request.
- `require('dotenv').config()` — reads `.env` and loads into `process.env`.
- `pool.connect()` — tests connection on startup. Fails fast instead of failing silently later.
- `module.exports = pool` — any file that does `require('./config/db')` gets this same pool.

**Why separate fields instead of connection string:**
Using `host`, `port`, `database`, `user`, `password` separately avoids URL parsing issues where special characters in passwords can silently fail.

---

### `src/middleware/auth.js`
```js
const jwt = require('jsonwebtoken')
require('dotenv').config()

function authenticate(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    return res.status(401).json({ error: 'No token provided' })
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.user = decoded
    next()
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' })
  }
}

module.exports = authenticate
```

**Key concepts:**
- `req.headers['authorization']` — grabs the `Authorization: Bearer <token>` header.
- `.split(' ')[1]` — splits `"Bearer eyJhbG..."` and takes index 1 (the actual token).
- `&&` short circuit — only calls `.split()` if `authHeader` exists.
- `jwt.verify()` — decodes AND verifies the token wasn't tampered with. Throws error if invalid.
- `req.user = decoded` — attaches `{ userId, role }` to the request. All downstream routes can use it.
- `next()` — tells Express to proceed to the route handler. Without this, the request hangs forever.

---

### `src/routes/auth.js`

**Register endpoint:**
```js
router.post('/register', async (req, res) => {
  const { email, password, role } = req.body

  if (!email || !password || !role) {
    return res.status(400).json({ error: 'email, password and role are required' })
  }

  try {
    const password_hash = await bcrypt.hash(password, 10)

    const result = await pool.query(
      'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role',
      [email, password_hash, role]
    )

    res.status(201).json({ user: result.rows[0] })

  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already exists' })
    }
    res.status(500).json({ error: err.message })
  }
})
```

**Key concepts:**
- `bcrypt.hash(password, 10)` — hashes password with 10 salt rounds (2^10 = 1024 iterations). Makes brute-forcing computationally expensive. One-way — you cannot reverse it.
- `$1, $2, $3` — parameterized queries. NEVER concatenate user input into SQL strings directly. That's SQL injection. `pg` safely escapes values when you use `$1, $2`.
- `RETURNING id, email, role` — returns the inserted row. Note: `password_hash` is excluded. Never send it to the client.
- `err.code === '23505'` — PostgreSQL's error code for unique constraint violation. Catches duplicate email at the DB level.

**Login endpoint:**
```js
router.post('/login', async (req, res) => {
  const { email, password } = req.body

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email])
    const user = result.rows[0]

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    )

    res.json({ token, role: user.role })

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})
```

**Key concepts:**
- Both wrong email and wrong password return the exact same message. This prevents **user enumeration attacks** — where attackers probe which emails are registered by looking for different error messages.
- `bcrypt.compare()` — re-hashes the input and compares. You never decrypt the stored hash. Decryption is impossible by design.
- `jwt.sign({ userId, role }, secret, { expiresIn })` — payload contains only what's needed. No password, no email. Just identity and permissions.

---

### `src/index.js`
```js
const express = require('express')
const app = express()
require('dotenv').config()

const authenticate = require('./middleware/auth')
const authRoutes = require('./routes/auth')

app.use(express.json())
app.use('/auth', authRoutes)

app.get('/me', authenticate, (req, res) => {
  res.json({ message: 'You are authenticated', user: req.user })
})

app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
```

**Key concepts:**
- `app.use(express.json())` — must come before routes. Without it, `req.body` is undefined.
- `app.use('/auth', authRoutes)` — mounts router at `/auth`. So `router.post('/register')` becomes `POST /auth/register`.
- Three-argument route `(path, middleware, handler)` — `authenticate` runs first. If it calls `next()`, the handler runs. If it returns 401/403, the handler never runs.
- `process.env.PORT || 3000` — deployment platforms inject their own PORT. `|| 3000` is your local fallback.
- `/health` endpoint — no auth needed. Confirms the server is alive. Used in deployment monitoring.

---

## 10. API Endpoints

| Method | Endpoint | Auth Required | Description |
|---|---|---|---|
| POST | `/auth/register` | No | Create a new user account |
| POST | `/auth/login` | No | Login and receive JWT |
| GET | `/me` | Yes | Get current authenticated user |
| GET | `/health` | No | Server health check |

---

## 11. Testing Results

All 5 tests passed in Postman:

| Test | Expected | Result |
|---|---|---|
| Register new user | `201 Created` | ✅ |
| Register same email again | `409 Conflict` | ✅ |
| Login with correct credentials | `200 OK` + token | ✅ |
| GET `/me` with valid token | `200 OK` + user payload | ✅ |
| GET `/me` with no token | `401 Unauthorized` | ✅ |

---

## 12. Mistakes Made and Lessons Learned

### Mistake 1 — Typo in package name
Typed `bcyptjs` instead of `bcryptjs`. npm threw a 404.

**Lesson:** Read error messages carefully. `Not Found - GET https://registry.npmjs.org/bcyptjs` tells you exactly what went wrong.

---

### Mistake 2 — Committed `.env` to GitHub
The `.env` file with real credentials was pushed to a public GitHub repo.

**Fix:**
```bash
git rm --cached .env
git add .gitignore
git commit -m "fix: remove .env from tracking"
git push
```

**Lesson:** Check `.gitignore` before the very first commit. Once secrets are on GitHub, treat them as compromised and rotate them immediately.

---

### Mistake 3 — Committed `node_modules` to GitHub
`node_modules` was not in `.gitignore` and got pushed.

**Fix:**
```bash
git rm -r --cached node_modules
git add .
git commit -m "fix: remove node_modules from tracking"
git push
```

**Lesson:** Recruiters look at your repos. `node_modules` committed signals poor Git hygiene before they read a single line of code.

---

### Mistake 4 — Shared real credentials in chat
Pasted the actual `.env` contents including database password and JWT secret.

**Lesson:** Never share `.env` values anywhere — chat, Slack, screenshots. If you need to show config structure for debugging, substitute fake values:
```
DATABASE_URL=postgresql://postgres:[HIDDEN]@localhost:5432/campusos
```

---

### Mistake 5 — DATABASE_URL parsing failure
Using a connection string caused `SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string`.

**Root cause:** URL parsing was stripping or misreading the password.

**Fix:** Switch to separate config fields:
```js
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
})
```

**Lesson:** When a connection string fails, separate fields eliminate URL parsing as a variable. Debug by isolating what could go wrong.

---

## 13. Phase 0 Checkpoint — Deep Answers

These are the answers you need to know cold for interviews and for building the rest of this project.

**Q: What does `bcrypt.hash(password, 10)` actually do?**

It converts `"password123"` into a fixed-length unrecognizable string like `$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHuu`. This process runs the hashing algorithm 2^10 = 1024 times deliberately, making brute-force attacks computationally expensive. The result cannot be reversed — ever. On login, bcrypt re-hashes the input and compares the two hashes. You never decrypt.

**Q: Why does login return "Invalid credentials" for both wrong email and wrong password?**

To prevent **user enumeration attacks**. If you return "User not found" vs "Wrong password", an attacker can probe your system with thousands of emails to build a list of valid accounts. Returning the same message for both cases eliminates that information leak.

**Q: What's inside the JWT payload?**

`{ userId: 1, role: "student", iat: <timestamp>, exp: <timestamp> }`. Only identity and permissions. No password, no password_hash, no email. The payload is base64 encoded — not encrypted — so never put sensitive data in it.

**Q: What happens if someone sends a tampered token to `/me`?**

`jwt.verify()` throws an error. Even changing a single character of the token invalidates the signature. The catch block returns `403 Forbidden`. The route handler never runs.

**Q: Why does the `CHECK` constraint on `role` exist when Node already validates it?**

Defence in depth. Application code can have bugs, someone might bypass your API and write directly to the DB, or a future developer might forget to add validation. The constraint means the database is the last line of defence — invalid data physically cannot be stored regardless of what happens at the application layer.

---

## Git Commit History (Phase 0)

```
feat: complete auth system with register, login, JWT middleware
fix: remove node_modules from tracking
fix: remove .env from tracking
initial setup: project structure, db config, env
```

---

## What's Next — Phase 1

Academic structure: the skeleton that everything else in this project depends on.

```
Programmes → Semesters → Courses → Sections
```

Four tables. Full CRUD APIs. Understanding foreign keys and relational integrity before attendance, timetables, and analytics can exist.