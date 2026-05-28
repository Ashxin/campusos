# CampusOS — Phase 1 Notes
### Academic Structure — Programmes, Semesters, Courses, Sections
> Personal learning notes — built as part of CampusOS Student Success Hub project

---

## Table of Contents
1. [The Mental Model](#1-the-mental-model)
2. [What is a Relational Hierarchy?](#2-what-is-a-relational-hierarchy)
3. [What are Foreign Keys?](#3-what-are-foreign-keys)
4. [What is Authorization vs Authentication?](#4-what-is-authorization-vs-authentication)
5. [What is a JOIN?](#5-what-is-a-join)
6. [Updated Folder Structure](#6-updated-folder-structure)
7. [Database — Four Tables](#7-database--four-tables)
8. [File by File Breakdown](#8-file-by-file-breakdown)
9. [API Endpoints](#9-api-endpoints)
10. [Testing Results](#10-testing-results)
11. [Mistakes Made and Lessons Learned](#11-mistakes-made-and-lessons-learned)
12. [Phase 1 Checkpoint — Deep Answers](#12-phase-1-checkpoint--deep-answers)

---

## 1. The Mental Model

Phase 0 built the door — authentication. Phase 1 builds the building itself.

Everything in CampusOS depends on academic structure. Attendance needs sections. Timetables need sections. Arrears tracking needs courses. None of those phases can exist until this hierarchy exists and is enforced correctly at the database level.

The hierarchy:

```
Programmes
    └── Semesters     (belong to a programme)
    └── Courses       (belong to a programme)
              └── Sections   (where a course meets a semester, taught by a faculty)
```

A Section is the most important entity in the entire project. It is the junction where a course, a semester, and a faculty member connect. Every future feature — attendance, timetables, enrollment — hangs off `sections.id`.

---

## 2. What is a Relational Hierarchy?

Data in the real world has relationships. A student belongs to a section. A section belongs to a course. A course belongs to a programme. These are not just conceptual — they need to be enforced at the database level.

**Relational thinking:**

| Entity | Belongs To | Cannot Exist Without |
|---|---|---|
| Programme | Nothing | Nothing — top of the hierarchy |
| Semester | Programme | A programme |
| Course | Programme | A programme |
| Section | Course + Semester | Both a course and a semester |

**Why this matters:** If you delete a programme, everything under it becomes orphaned data — semesters and courses that reference a programme that no longer exists. PostgreSQL prevents this through foreign keys and cascade rules.

---

## 3. What are Foreign Keys?

A foreign key is a column in one table that references the primary key of another table. It enforces the relationship at the database level.

```sql
programme_id INT NOT NULL REFERENCES programmes(id) ON DELETE CASCADE
```

This means: `programme_id` must exist in the `programmes` table. You cannot insert a semester for a programme that doesn't exist. The database physically rejects it with error code `23503`.

### ON DELETE behavior — three options

| Behavior | What it does | When to use |
|---|---|---|
| `CASCADE` | Deletes child rows automatically | Child cannot meaningfully exist without parent |
| `SET NULL` | Sets the foreign key to NULL | Child can exist without the parent — just unassigned |
| `RESTRICT` | Blocks the delete entirely | You must manually clean up children first |

### The cascade chain in this project

```
DELETE programmes row
→ CASCADE deletes its semesters
→ CASCADE deletes its courses
→ CASCADE deletes all sections of those courses
```

One delete at the top wipes the entire tree. This is why `ON DELETE CASCADE` is not something you add carelessly — it is a nuclear option.

### The faculty exception

`faculty_id` on sections uses `ON DELETE SET NULL`, not CASCADE. If a faculty member's user account is deleted, the section still exists — `faculty_id` becomes `NULL`. The class still runs, it just needs a new faculty assigned. Using CASCADE here would delete the section, which would delete all attendance records — catastrophic data loss for a single staff change.

---

## 4. What is Authorization vs Authentication?

These two words are different things. Confusing them is one of the most common mistakes in backend development.

| Concept | Question it answers | Phase built in |
|---|---|---|
| **Authentication** | Who are you? | Phase 0 — `auth.js` middleware |
| **Authorization** | Are you allowed to do this? | Phase 1 — `authorize.js` middleware |

Authentication verifies identity — it checks the JWT. Authorization checks permissions — it checks the role inside the JWT.

They always work together in this order:

```
Request arrives
→ authenticate runs first   → verifies the token → attaches req.user
→ authorize runs second     → checks req.user.role → allows or blocks
→ route handler runs last   → only if both pass
```

### The authorize middleware pattern

```js
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' })
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' })
    }
    next()
  }
}
```

`authorize(...roles)` — the `...` collects arguments into an array. `authorize('admin')` creates a middleware that only allows admins. `authorize('admin', 'faculty')` creates one that allows both.

This is a **middleware factory** — a function that returns a middleware function. It is not middleware itself. `authenticate` is a plain function because it always does the same thing. `authorize` must return a function because it needs to know which roles to allow — and that changes per route.

**401 vs 403 in this context:**
- `401` — `req.user` doesn't exist. `authenticate` didn't run. Identity is unknown.
- `403` — `req.user` exists but the role isn't in the allowed list. Identity is known. Permission is denied.

---

## 5. What is a JOIN?

A JOIN combines rows from two or more tables based on a related column.

Without a JOIN, a section row looks like this:
```json
{
  "id": 3,
  "course_id": 4,
  "semester_id": 4,
  "faculty_id": 3,
  "section_name": "A"
}
```

That's just IDs. Useless without a second query to look up what those IDs mean.

With a JOIN, the same row looks like this:
```json
{
  "id": 3,
  "section_name": "A",
  "course_name": "Data Structures",
  "course_code": "CS101",
  "semester_name": "Semester 1",
  "semester_number": 1,
  "programme_name": "Bachelor of Technology - CSE",
  "faculty_email": "admin@campusos.com"
}
```

One query. All the context. That is what JOINs do.

### INNER JOIN vs LEFT JOIN

```sql
-- INNER JOIN: only returns rows where a match exists on BOTH sides
JOIN users u ON sec.faculty_id = u.id

-- LEFT JOIN: returns all rows from the left table, NULL if no match on right
LEFT JOIN users u ON sec.faculty_id = u.id
```

`faculty_id` is nullable — a section can exist with no faculty assigned. If you use an inner JOIN, sections with `faculty_id = NULL` are silently excluded from your results. That is a hard bug to find. The rule: **any time a foreign key is nullable, use LEFT JOIN.**

### The four-table JOIN in sections

```sql
SELECT 
  sec.*,
  c.name        AS course_name,
  s.name        AS semester_name,
  p.name        AS programme_name,
  u.email       AS faculty_email
FROM sections sec
JOIN courses    c ON sec.course_id   = c.id
JOIN semesters  s ON sec.semester_id = s.id
JOIN programmes p ON c.programme_id  = p.id
LEFT JOIN users u ON sec.faculty_id  = u.id
```

Table aliases (`sec`, `c`, `s`, `p`, `u`) are shorthand so you don't type full table names repeatedly. `AS course_name` renames columns in the response to avoid clashes — both `courses` and `semesters` have a `name` column.

---

## 6. Updated Folder Structure

```
campusos-backend/
├── src/
│   ├── config/
│   │   └── db.js              ← unchanged from Phase 0
│   ├── middleware/
│   │   ├── auth.js            ← unchanged from Phase 0
│   │   └── authorize.js       ← NEW — role-based access control
│   ├── routes/
│   │   ├── auth.js            ← unchanged from Phase 0
│   │   ├── programmes.js      ← NEW
│   │   ├── semesters.js       ← NEW
│   │   ├── courses.js         ← NEW
│   │   └── sections.js        ← NEW
│   └── index.js               ← updated — mounts all new routes
├── .env
└── package.json
```

No new packages were installed in Phase 1. Everything built here uses what Phase 0 already installed.

---

## 7. Database — Four Tables

### Design decisions before writing SQL

**Decision 1: Are semesters global or programme-specific?**
Each programme owns its own semesters. B.Tech CSE has 8 semesters, MBA has 4, and their dates differ. Sharing semesters across programmes creates entanglement that breaks in later phases.

**Decision 2: ON DELETE CASCADE or SET NULL for faculty?**
Faculty → `SET NULL`. Deleting a user account should not cascade-delete the sections they taught. The section survives, just unassigned. Using CASCADE would silently destroy attendance data.

**Decision 3: What UNIQUE constraints does the DB enforce?**
- `semesters`: `UNIQUE (programme_id, semester_number)` — B.Tech CSE cannot have two Semester 3s
- `sections`: `UNIQUE (course_id, semester_id, section_name)` — Data Structures cannot have two "Section A" rows in Semester 3

### The SQL

```sql
-- 1. Programmes
CREATE TABLE programmes (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(100) UNIQUE NOT NULL,
  code            VARCHAR(20)  UNIQUE NOT NULL,
  duration_years  INT NOT NULL CHECK (duration_years BETWEEN 1 AND 6),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Semesters — belong to a programme
CREATE TABLE semesters (
  id               SERIAL PRIMARY KEY,
  programme_id     INT NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
  name             VARCHAR(50) NOT NULL,
  semester_number  INT NOT NULL CHECK (semester_number BETWEEN 1 AND 12),
  start_date       DATE NOT NULL,
  end_date         DATE NOT NULL,
  is_active        BOOLEAN DEFAULT false,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (programme_id, semester_number)
);

-- 3. Courses — belong to a programme
CREATE TABLE courses (
  id            SERIAL PRIMARY KEY,
  programme_id  INT NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
  name          VARCHAR(100) NOT NULL,
  code          VARCHAR(20)  UNIQUE NOT NULL,
  credits       INT NOT NULL DEFAULT 3 CHECK (credits BETWEEN 1 AND 6),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Sections — where course meets semester
CREATE TABLE sections (
  id            SERIAL PRIMARY KEY,
  course_id     INT NOT NULL REFERENCES courses(id)   ON DELETE CASCADE,
  semester_id   INT NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
  faculty_id    INT          REFERENCES users(id)     ON DELETE SET NULL,
  section_name  VARCHAR(10) NOT NULL DEFAULT 'A',
  max_students  INT NOT NULL DEFAULT 60 CHECK (max_students > 0),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (course_id, semester_id, section_name)
);
```

### PostgreSQL error codes to know

| Code | Meaning | When it fires |
|---|---|---|
| `23505` | Unique violation | Duplicate email, duplicate course code, duplicate section |
| `23503` | Foreign key violation | Referencing an ID that doesn't exist in the parent table |

---

## 8. File by File Breakdown

### `src/middleware/authorize.js`

```js
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' })
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' })
    }
    next()
  }
}

module.exports = authorize
```

**Key concepts:**
- `...roles` — rest parameter. Collects all arguments into an array. Allows `authorize('admin')` or `authorize('admin', 'faculty')`.
- Returns a function — this is a middleware factory. The returned function is what Express actually calls per request.
- `!req.user` — defensive guard. `authenticate` sets `req.user`. If it didn't run before `authorize`, this catches it.
- `roles.includes(req.user.role)` — checks membership. If the user's role isn't in the allowed list, return `403`.

---

### `src/routes/programmes.js`

Five endpoints. No JOINs needed — programmes sit at the top of the hierarchy and don't reference other tables.

**Key concept — COALESCE for partial updates:**

```sql
UPDATE programmes 
SET name           = COALESCE($1, name), 
    code           = COALESCE($2, code), 
    duration_years = COALESCE($3, duration_years)
WHERE id = $4
```

`COALESCE($1, name)` means: use the new value if provided, otherwise keep the existing column value. This allows partial updates — a client can send just `{ "name": "B.Tech CSE" }` without sending `code` or `duration_years`. Without `COALESCE`, missing fields would overwrite existing values with `NULL` and corrupt the data.

---

### `src/routes/semesters.js`

First route that introduces JOINs and query string filtering.

**Key concept — dynamic query building:**

```js
let query = `
  SELECT s.*, p.name AS programme_name
  FROM semesters s
  JOIN programmes p ON s.programme_id = p.id
`
const params = []

if (programme_id) {
  query += ' WHERE s.programme_id = $1'
  params.push(programme_id)
}
```

The query is built dynamically. If `?programme_id=1` is in the URL, a WHERE clause is added. If not, all semesters are returned. The params array stays in sync with the `$1` placeholders — never concatenate user input directly into the query string.

---

### `src/routes/courses.js`

Same pattern as semesters. Same JOIN to programmes. Same dynamic filtering by `programme_id`.

This repetition is intentional. Patterns become instinct through repetition. By the third time you write the same structure, it stops being something you think about and becomes something you just write.

---

### `src/routes/sections.js`

The most complex route. Joins four tables. Introduces `LEFT JOIN`.

**The full SELECT:**

```js
SELECT 
  sec.*,
  c.name        AS course_name,
  c.code        AS course_code,
  c.credits     AS course_credits,
  s.name        AS semester_name,
  s.semester_number,
  p.name        AS programme_name,
  p.code        AS programme_code,
  u.email       AS faculty_email
FROM sections sec
JOIN courses    c ON sec.course_id   = c.id
JOIN semesters  s ON sec.semester_id = s.id
JOIN programmes p ON c.programme_id  = p.id
LEFT JOIN users u ON sec.faculty_id  = u.id
```

**Why LEFT JOIN for users:** `faculty_id` is nullable. An inner JOIN would exclude sections with no faculty assigned — they would silently disappear from results. `LEFT JOIN` returns them with `faculty_email: null`.

**Filtering by both course and semester:**

```js
if (course_id && semester_id) {
  query += ' WHERE sec.course_id = $1 AND sec.semester_id = $2'
  params.push(course_id, semester_id)
} else if (course_id) {
  query += ' WHERE sec.course_id = $1'
  params.push(course_id)
} else if (semester_id) {
  query += ' WHERE sec.semester_id = $1'
  params.push(semester_id)
}
```

Three cases handled: both filters, just one, or neither. The params array always stays in sync with the numbered placeholders.

---

### `src/index.js` — updated

```js
const express = require('express')
const app = express()
require('dotenv').config()

const authenticate = require('./middleware/auth')
const authRoutes = require('./routes/auth')
const programmeRoutes = require('./routes/programmes')
const semesterRoutes = require('./routes/semesters')
const courseRoutes = require('./routes/courses')
const sectionRoutes = require('./routes/sections')

app.use(express.json())
app.use('/auth', authRoutes)
app.use('/programmes', programmeRoutes)
app.use('/semesters', semesterRoutes)
app.use('/courses', courseRoutes)
app.use('/sections', sectionRoutes)

app.get('/me', authenticate, (req, res) => {
  res.json({ message: 'You are authenticated', user: req.user })
})

app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
```

---

## 9. API Endpoints

### Programmes

| Method | Endpoint | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/programmes` | Yes | Any | Get all programmes |
| GET | `/programmes/:id` | Yes | Any | Get one programme |
| POST | `/programmes` | Yes | Admin | Create a programme |
| PUT | `/programmes/:id` | Yes | Admin | Update a programme |
| DELETE | `/programmes/:id` | Yes | Admin | Delete a programme |

### Semesters

| Method | Endpoint | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/semesters` | Yes | Any | Get all semesters (filter: `?programme_id=`) |
| GET | `/semesters/:id` | Yes | Any | Get one semester |
| POST | `/semesters` | Yes | Admin | Create a semester |
| PUT | `/semesters/:id` | Yes | Admin | Update a semester |
| DELETE | `/semesters/:id` | Yes | Admin | Delete a semester |

### Courses

| Method | Endpoint | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/courses` | Yes | Any | Get all courses (filter: `?programme_id=`) |
| GET | `/courses/:id` | Yes | Any | Get one course |
| POST | `/courses` | Yes | Admin | Create a course |
| PUT | `/courses/:id` | Yes | Admin | Update a course |
| DELETE | `/courses/:id` | Yes | Admin | Delete a course |

### Sections

| Method | Endpoint | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/sections` | Yes | Any | Get all sections (filter: `?course_id=`, `?semester_id=`) |
| GET | `/sections/:id` | Yes | Any | Get one section |
| POST | `/sections` | Yes | Admin | Create a section |
| PUT | `/sections/:id` | Yes | Admin | Update a section |
| DELETE | `/sections/:id` | Yes | Admin | Delete a section |

---

## 10. Testing Results

All tests passed in Postman across all four resources:

### Programmes
| Test | Expected | Result |
|---|---|---|
| GET without token | `401 Unauthorized` | ✅ |
| POST with student token | `403 Forbidden` | ✅ |
| POST with admin token | `201 Created` | ✅ |
| POST duplicate code | `409 Conflict` | ✅ |
| GET all programmes | `200 OK` | ✅ |
| GET by id | `200 OK` | ✅ |
| GET non-existent id | `404 Not Found` | ✅ |

### Semesters
| Test | Expected | Result |
|---|---|---|
| POST valid semester | `201 Created` | ✅ |
| POST duplicate semester_number | `409 Conflict` | ✅ |
| POST invalid programme_id | `404 Not Found` | ✅ |
| GET all — programme_name in response | `200 OK` | ✅ |
| GET filtered by programme_id | `200 OK` | ✅ |
| PUT partial update (is_active only) | `200 OK` — other fields unchanged | ✅ |

### Courses
| Test | Expected | Result |
|---|---|---|
| POST valid course | `201 Created` | ✅ |
| POST duplicate code | `409 Conflict` | ✅ |
| POST invalid programme_id | `404 Not Found` | ✅ |
| GET all — programme_name in response | `200 OK` | ✅ |
| PUT partial update (credits only) | `200 OK` — other fields unchanged | ✅ |

### Sections
| Test | Expected | Result |
|---|---|---|
| POST valid section | `201 Created` | ✅ |
| POST duplicate section | `409 Conflict` | ✅ |
| POST Section B (same course, same semester) | `201 Created` | ✅ |
| POST invalid course_id | `404 Not Found` | ✅ |
| GET all — 4-table JOIN response | `200 OK` — faculty_email null | ✅ |
| GET filtered by semester_id | `200 OK` | ✅ |
| GET filtered by course_id + semester_id | `200 OK` | ✅ |
| PUT assign faculty | `200 OK` | ✅ |
| GET after faculty assigned | `200 OK` — faculty_email populated | ✅ |

---

## 11. Mistakes Made and Lessons Learned

### Mistake 1 — Forgot to mount route in index.js
Tested `POST /semesters` and got `404 Not Found` with an HTML error page that said `Cannot POST /semesters`.

**Root cause:** The route file was created but never imported and mounted in `index.js`.

**Fix:** Add two lines to `index.js`:
```js
const semesterRoutes = require('./routes/semesters')
app.use('/semesters', semesterRoutes)
```

**Lesson:** When you get an HTML error page from Express (not a JSON response), it means Express has no route registered for that path. It's never a database problem. Check `index.js` first.

---

### Mistake 2 — Deleted test data that later tests depended on
Ran DELETE tests on courses and semesters, then tried to create sections using those IDs. Got `404 Course, semester or faculty not found`.

**Root cause:** DELETE tests removed the data that section tests needed. IDs don't recycle — deleted `id: 1` is gone, the next insert becomes `id: 4`.

**Lesson:** Never run DELETE tests on data that other tests depend on. Create test data at the start, run all non-destructive tests, run DELETE tests last. In production systems, use a separate test database with seed data that resets between test runs.

---

### Mistake 3 — Used stale IDs in request bodies
After recreating data, continued using old IDs (`course_id: 1`, `semester_id: 1`) in POST bodies. Got `23503` foreign key errors because those rows no longer existed.

**Root cause:** Not checking what IDs actually exist in the database before writing requests.

**Fix:** Always `GET /courses` and `GET /semesters` after recreating data to get the current IDs before making dependent requests.

**Lesson:** The database is the source of truth, not your memory. Before any request that references an ID, verify that ID exists. This habit prevents hours of confused debugging.

---

### Mistake 4 — Used invalid faculty_id
Tried to assign `faculty_id: 2` to a section. Got `500 Internal Server Error` with foreign key violation. User `id: 2` didn't exist.

**Fix:** Check `GET /me` to get your own user ID, or query `SELECT id, email, role FROM users` in psql.

**Lesson:** `faculty_id` references the `users` table. Only user IDs that actually exist in that table are valid. Foreign key constraints exist precisely to catch this at the database level.

---

## 12. Phase 1 Checkpoint — Deep Answers

**Q: What is the cascade chain when you delete a programme?**

Deleting a programme triggers `ON DELETE CASCADE` on semesters (which have `programme_id`) and courses (which have `programme_id`). Deleting those courses triggers `ON DELETE CASCADE` on sections (which have `course_id`). One delete at the top of the hierarchy removes the entire tree beneath it — semesters, courses, and all their sections.

**Q: Why does `faculty_id` use `ON DELETE SET NULL` instead of `CASCADE`?**

Because a section can meaningfully exist without a faculty member — it just needs one assigned. Deleting a user account should not cascade-delete the sections they taught. Sections carry attendance data that belongs to students, not to the faculty. `SET NULL` keeps the section intact and marks it as unassigned. `CASCADE` would silently destroy student attendance records because one staff member left — that would be catastrophic.

**Q: Why does `authorize` return a function instead of being a function directly like `authenticate`?**

`authenticate` always does the same thing — verify the token. It needs no input. `authorize` needs to know which roles are allowed, and that changes per route. You call `authorize('admin')` and it creates a middleware locked to that role check. `authorize('admin', 'faculty')` creates a different one. The factory pattern lets you create role-specific middleware on demand using a single reusable function.

**Q: Why use `LEFT JOIN` for faculty but regular `JOIN` for courses, semesters, and programmes?**

`faculty_id` is nullable — a section can exist with no faculty assigned. A regular JOIN only returns rows where both sides have a match. If `faculty_id` is NULL, there is no matching user row, and the entire section row would be excluded from results. `LEFT JOIN` returns all section rows regardless, with `faculty_email: null` when unassigned. Courses, semesters, and programmes are `NOT NULL` foreign keys — every section is guaranteed to have a matching course, semester, and programme, so a regular JOIN is safe.

**Q: What does `COALESCE($1, name)` do in an UPDATE query?**

It returns the first non-null value. If `$1` (the new value sent by the client) is provided, use it. If `$1` is null (not sent), keep the existing column value. This enables partial updates — a client can update just one field without sending the entire object. Without `COALESCE`, unsent fields would overwrite existing values with `NULL`.

**Q: What is the difference between error code `23505` and `23503`?**

`23505` is a unique constraint violation — you tried to insert a duplicate value into a column marked `UNIQUE`. Example: two courses with the same `code`.  
`23503` is a foreign key violation — you tried to reference an ID in another table that doesn't exist. Example: creating a semester with `programme_id: 999` when no programme with that ID exists.

---

## Git Commit History (Phase 1)

```
feat: complete academic structure — programmes, semesters, courses, sections
feat: add authorize middleware for role-based access control
feat: add programme routes with full CRUD
feat: add semester routes with JOIN and programme filtering
feat: add course routes with JOIN and programme filtering
feat: add section routes with 4-table JOIN and LEFT JOIN for faculty
```

---

## What's Next — Phase 2

Timetable and clash detection.

```
Sections → Timetable Slots → Clash Detection
```

A timetable slot assigns a section to a day, time, and room. Clash detection prevents two sections from being scheduled in the same room at the same time, or the same faculty being double-booked. This phase introduces more complex SQL — window functions, subqueries, and constraint checking at the application layer before the insert.
