const express = require('express')
const router = express.Router()
const pool = require('../config/db')
const authenticate = require('../middleware/auth')
const authorize = require('../middleware/authorize')



router.get('/', authenticate, async (req, res) => {
  const { section_id } = req.query

  let query = `SELECT e.*, u.email FROM enrollments e JOIN users u ON e.student_id = u.id`
  const params = []

  if (section_id) {
    query += ' WHERE e.section_id = $1'
    params.push(section_id)
  }

  try {
    const result = await pool.query(query, params)
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})


router.post('/', authenticate, authorize('admin'), async(req, res) => {
  const { student_id, section_id} = req.body

  if(!section_id || !student_id) {
    return res.status(400).json({ error: 'student_id and section_id required'})
  }

  try {
    const result = await pool.query(
      `INSERT INTO enrollments (student_id, section_id) VALUES ($1, $2) RETURNING *`, [ student_id, section_id]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Section already exists for this student' })
    }
    if (err.code === '23503') {
      return res.status(404).json({ error: 'Student, not found' })
    }
    res.status(500).json({ error: err.message })
  }
})

module.exports = router