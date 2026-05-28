const express = require('express')
const router = express.Router()
const pool = require('../config/db')
const authenticate = require('../middleware/auth')
const authorize = require('../middleware/authorize')

// GET all courses — optionally filter by programme
router.get('/', authenticate, async (req, res) => {
  try {
    const { programme_id } = req.query

    let query = `
      SELECT c.*, p.name AS programme_name, p.code AS programme_code
      FROM courses c
      JOIN programmes p ON c.programme_id = p.id
    `
    const params = []

    if (programme_id) {
      query += ' WHERE c.programme_id = $1'
      params.push(programme_id)
    }

    query += ' ORDER BY c.programme_id, c.name'

    const result = await pool.query(query, params)
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET one course by id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, p.name AS programme_name, p.code AS programme_code
       FROM courses c
       JOIN programmes p ON c.programme_id = p.id
       WHERE c.id = $1`,
      [req.params.id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Course not found' })
    }

    res.json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST create course — admin only
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  const { programme_id, name, code, credits } = req.body

  if (!programme_id || !name || !code) {
    return res.status(400).json({ error: 'programme_id, name and code are required' })
  }

  try {
    const result = await pool.query(
      `INSERT INTO courses (programme_id, name, code, credits)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [programme_id, name, code, credits || 3]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Course code already exists' })
    }
    if (err.code === '23503') {
      return res.status(404).json({ error: 'Programme not found' })
    }
    res.status(500).json({ error: err.message })
  }
})

// PUT update course — admin only
router.put('/:id', authenticate, authorize('admin'), async (req, res) => {
  const { name, code, credits } = req.body

  try {
    const result = await pool.query(
      `UPDATE courses
       SET name    = COALESCE($1, name),
           code    = COALESCE($2, code),
           credits = COALESCE($3, credits)
       WHERE id = $4
       RETURNING *`,
      [name, code, credits, req.params.id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Course not found' })
    }

    res.json(result.rows[0])
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Course code already exists' })
    }
    res.status(500).json({ error: err.message })
  }
})

// DELETE course — admin only
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM courses WHERE id = $1 RETURNING *',
      [req.params.id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Course not found' })
    }

    res.json({ message: 'Course deleted', course: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router