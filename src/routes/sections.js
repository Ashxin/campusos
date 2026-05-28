const express = require('express')
const router = express.Router()
const pool = require('../config/db')
const authenticate = require('../middleware/auth')
const authorize = require('../middleware/authorize')

// GET all sections — optionally filter by course or semester
router.get('/', authenticate, async (req, res) => {
  try {
    const { course_id, semester_id } = req.query

    let query = `
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
      JOIN courses   c ON sec.course_id   = c.id
      JOIN semesters s ON sec.semester_id = s.id
      JOIN programmes p ON c.programme_id = p.id
      LEFT JOIN users u ON sec.faculty_id = u.id
    `
    const params = []

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

    query += ' ORDER BY p.name, s.semester_number, c.name, sec.section_name'

    const result = await pool.query(query, params)
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET one section by id
router.get('/:id', authenticate, async (req, res) => {
  try { // every other JOIN in this project has been an inner JOIN. If there is no match, the row is excluded from results. For faculty_id we use LEFT JOIN users u ON sec.faculty_id = u.id. This means: include the section row even if faculty_id is NULL -- just set faculty_email to NULL in the responsse. IF you used a regular JOIN, sections with no assigned faculty would silently disappear from your results. That Would be a very hard bug to track down
    const result = await pool.query(
      `SELECT 
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
      WHERE sec.id = $1`,
      [req.params.id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Section not found' })
    }

    res.json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST create section — admin only
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  const { course_id, semester_id, faculty_id, section_name, max_students } = req.body

  if (!course_id || !semester_id) {
    return res.status(400).json({ error: 'course_id and semester_id are required' })
  }

  try {
    const result = await pool.query(
      `INSERT INTO sections (course_id, semester_id, faculty_id, section_name, max_students)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [course_id, semester_id, faculty_id || null, section_name || 'A', max_students || 60]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Section already exists for this course and semester' })
    }
    if (err.code === '23503') {
      return res.status(404).json({ error: 'Course, semester or faculty not found' })
    }
    res.status(500).json({ error: err.message })
  }
})

// PUT update section — admin only
router.put('/:id', authenticate, authorize('admin'), async (req, res) => {
  const { faculty_id, section_name, max_students } = req.body

  try {
    const result = await pool.query(
      `UPDATE sections
       SET faculty_id   = COALESCE($1, faculty_id),
           section_name = COALESCE($2, section_name),
           max_students = COALESCE($3, max_students)
       WHERE id = $4
       RETURNING *`,
      [faculty_id, section_name, max_students, req.params.id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Section not found' })
    }

    res.json(result.rows[0])
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Section name already exists for this course and semester' })
    }
    res.status(500).json({ error: err.message })
  }
})

// DELETE section — admin only
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM sections WHERE id = $1 RETURNING *',
      [req.params.id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Section not found' })
    }

    res.json({ message: 'Section deleted', section: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router