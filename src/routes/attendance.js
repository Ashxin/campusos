const express = require('express')
const router = express.Router()
const pool = require('../config/db')
const authenticate = require('../middleware/auth')
const authorize = require('../middleware/authorize')
const { error } = require('node:console')


router.get('/:id', authenticate, async(req , res) => {
  try {
    const result = await pool.query(
      `SELECT u.email, COUNT(*) AS total_classes, COUNT(CASE WHEN ar.status IN ('present', 'late') THEN 1 END) AS attended, ROUND(COUNT(CASE WHEN ar.status IN ('present', 'late') THEN 1 END) * 100.0 / COUNT(*), 2) AS percentage FROM attendance_records ar JOIN enrollments e ON ar.enrollment_id = e.id JOIN users u ON e.student_id = u.id WHERE e.section_id = $1 GROUP BY u.id, u.email` , [req.params.id]
    )
    res.json(result.rows)
  } catch(err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', authenticate, authorize('admin', 'faculty'), async (req, res) => {
  const { date, records } = req.body

  if (!date || !records) {
    return res.status(400).json({ error: 'fields required'})
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    for (const record of records) {
      await client.query(
        'INSERT INTO attendance_records (enrollment_id, date, status) VALUES ($1, $2, $3)', [record.enrollment_id, date, record.status]
      )
    }
    await client.query('COMMIT')
    res.status(201).json({ message: 'Attendance marked' })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: err.message })

  } finally {
    client.release()
  }
})

module.exports = router