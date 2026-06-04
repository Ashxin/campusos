const express = require('express')
const router = express.Router()
const pool = require('../config/db')
const authenticate = require('../middleware/auth')
const authorize = require('../middleware/authorize')
const { error } = require('node:console')


router.get('/', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM notifications WHERE student_id = $1 ORDER BY created_at DESC`, [req.user.userId]
    )
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message})
  }
})

router.post('/generate/:section_id', authenticate, authorize('admin'), async (req, res) => {
  const {section_id} = req.params
  if(!section_id) {
    return res.status(400).json({ error: 'section_id required'})
  }

  try {
    const summary = await pool.query(
      `SELECT sa.student_id, sa.attendance_percentage FROM student_arrears sa WHERE section_id = $1 AND is_in_arrears = true`, [section_id]
    )
    for (const row of summary.rows) {
      const message = `Your attendance has dropped to ${row.attendance_percentage}%`
      await pool.query(
        `INSERT INTO notifications(student_id, section_id, type, message) VALUES ($1, $2, 'arrears_warning', $3) ON CONFLICT (student_id, section_id, type) DO NOTHING`, [row.student_id, section_id, message]
      )
    } 
    res.json({ message: `Notifications generated for ${summary.rows.length} students` })
  }catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router