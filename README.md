# CampusOS — Student Success Hub

A full-stack backend REST API for college management, built with Node.js, Express, and PostgreSQL. Covers authentication, academic structure, timetable scheduling, attendance tracking, arrears monitoring, notifications, and analytics.

---

## Tech Stack

- **Runtime:** Node.js
- **Framework:** Express
- **Database:** PostgreSQL
- **Auth:** JWT (jsonwebtoken), bcryptjs
- **Other:** dotenv, nodemon

---

## Features

- JWT-based authentication with role-based access control (student, faculty, admin)
- Academic structure — Programmes, Semesters, Courses, Sections
- Timetable scheduling with room and faculty clash detection
- Attendance tracking with bulk insert and transactions
- Arrears monitoring with materialized data and upsert
- Idempotent notifications system
- Analytics dashboard — at-risk reports, section health, programme rollups

---

## Getting Started

### Prerequisites

- Node.js
- PostgreSQL

### Installation

```bash
git clone https://github.com/yourusername/campusos-backend.git
cd campusos-backend
npm install
```

### Environment Variables

Create a `.env` file in the root directory:

```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=campusos
DB_USER=your_db_user
DB_PASSWORD=your_db_password
JWT_SECRET=your_jwt_secret
PORT=3000
```

### Run

```bash
npm run dev
```

---

## Database Schema

| Table | Description |
|---|---|
| `users` | Students, faculty, and admins |
| `programmes` | Degree programmes (e.g. B.Tech CSE) |
| `semesters` | Semesters belonging to a programme |
| `courses` | Courses belonging to a programme |
| `sections` | Where a course meets a semester, taught by a faculty |
| `timetable_slots` | Scheduled time, day, and room for a section |
| `enrollments` | Student to section membership |
| `attendance_records` | Per student, per date attendance status |
| `student_arrears` | Materialized attendance percentages and arrears status |
| `notifications` | Arrears warning notifications per student per section |

---

## API Endpoints

### Auth

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | No | Register a new user |
| POST | `/auth/login` | No | Login and receive JWT |
| GET | `/me` | Yes | Get current authenticated user |
| GET | `/health` | No | Server health check |

---

### Programmes

| Method | Endpoint | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/programmes` | Yes | Any | Get all programmes |
| GET | `/programmes/:id` | Yes | Any | Get one programme |
| POST | `/programmes` | Yes | Admin | Create a programme |
| PUT | `/programmes/:id` | Yes | Admin | Update a programme |
| DELETE | `/programmes/:id` | Yes | Admin | Delete a programme |

---

### Semesters

| Method | Endpoint | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/semesters` | Yes | Any | Get all semesters (filter: `?programme_id=`) |
| GET | `/semesters/:id` | Yes | Any | Get one semester |
| POST | `/semesters` | Yes | Admin | Create a semester |
| PUT | `/semesters/:id` | Yes | Admin | Update a semester |
| DELETE | `/semesters/:id` | Yes | Admin | Delete a semester |

---

### Courses

| Method | Endpoint | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/courses` | Yes | Any | Get all courses (filter: `?programme_id=`) |
| GET | `/courses/:id` | Yes | Any | Get one course |
| POST | `/courses` | Yes | Admin | Create a course |
| PUT | `/courses/:id` | Yes | Admin | Update a course |
| DELETE | `/courses/:id` | Yes | Admin | Delete a course |

---

### Sections

| Method | Endpoint | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/sections` | Yes | Any | Get all sections (filter: `?course_id=`, `?semester_id=`) |
| GET | `/sections/:id` | Yes | Any | Get one section |
| POST | `/sections` | Yes | Admin | Create a section |
| PUT | `/sections/:id` | Yes | Admin | Update a section |
| DELETE | `/sections/:id` | Yes | Admin | Delete a section |

---

### Timetable

| Method | Endpoint | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/timetable` | Yes | Any | Get all slots (filter: `?section_id=`) |
| GET | `/timetable/:id` | Yes | Any | Get one slot |
| POST | `/timetable` | Yes | Admin | Create a slot (with clash detection) |
| PUT | `/timetable/:id` | Yes | Admin | Update a slot (with clash detection) |
| DELETE | `/timetable/:id` | Yes | Admin | Delete a slot |

---

### Enrollments

| Method | Endpoint | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/enrollments` | Yes | Any | List enrollments (filter: `?section_id=`) |
| POST | `/enrollments` | Yes | Admin | Enroll a student in a section |

---

### Attendance

| Method | Endpoint | Auth | Role | Description |
|---|---|---|---|---|
| POST | `/attendance` | Yes | Admin, Faculty | Bulk mark attendance for a session |
| GET | `/attendance/:section_id` | Yes | Any | Get attendance summary for a section |

---

### Arrears

| Method | Endpoint | Auth | Role | Description |
|---|---|---|---|---|
| POST | `/arrears/calculate/:section_id` | Yes | Admin, Faculty | Calculate and store arrears for a section |
| GET | `/arrears/:section_id` | Yes | Any | Get stored arrears for a section |

---

### Notifications

| Method | Endpoint | Auth | Role | Description |
|---|---|---|---|---|
| POST | `/notifications/generate/:section_id` | Yes | Admin, Faculty | Generate notifications for at-risk students |
| GET | `/notifications` | Yes | Any | Get notifications for the logged-in user |

---

### Analytics

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/analytics/at-risk` | Yes | List all students currently in arrears |
| GET | `/analytics/section/:section_id` | Yes | Section health report |
| GET | `/analytics/programme/:programme_id` | Yes | Programme overview |

---

## Key Concepts Implemented

- **Parameterized queries** — all SQL uses `$1, $2` placeholders to prevent SQL injection
- **Transaction discipline** — bulk attendance uses `BEGIN/COMMIT/ROLLBACK` with `pool.connect()` and `client.release()` in `finally`
- **Clash detection** — timetable uses application-layer overlap formula `B.start < A.end AND B.end > A.start`
- **Materialized data** — arrears percentages computed once and stored, not recalculated on every read
- **Upsert** — `ON CONFLICT DO UPDATE` keeps arrears current without duplicates
- **Idempotency** — `ON CONFLICT DO NOTHING` ensures notifications are never duplicated
- **Defence in depth** — CHECK constraints at DB level back up application-layer validation
