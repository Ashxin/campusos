const express = require('express')
const router = express.Router()
const pool = require('../config/db')
const authenticate = require('../middleware/auth')
const authorize = require('../middleware/authorize')

// POST /arrears/calculate/:section_id
router.post('/calculate/:section_id', authenticate, authorize('admin', 'faculty'), async (req, res) => {
  const { section_id } = req.params

  try {
    // Step 1 — calculate attendance percentage per student in this section
    const summary = await pool.query(
      `SELECT
        e.student_id,
        ROUND(
          COUNT(CASE WHEN ar.status IN ('present', 'late') THEN 1 END) * 100.0 / COUNT(*),
          2
        ) AS percentage
      FROM attendance_records ar
      JOIN enrollments e ON ar.enrollment_id = e.id
      WHERE e.section_id = $1
      GROUP BY e.student_id`,
      [section_id]
    )

    // Step 2 — upsert each result into student_arrears
    for (const row of summary.rows) {
      await pool.query(
        `INSERT INTO student_arrears 
          (student_id, section_id, attendance_percentage, is_in_arrears, last_calculated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (student_id, section_id)
         DO UPDATE SET
           attendance_percentage = EXCLUDED.attendance_percentage,
           is_in_arrears         = EXCLUDED.is_in_arrears,
           last_calculated_at    = NOW()`,
        [row.student_id, section_id, row.percentage, row.percentage < 75]
      )
    }

    res.json({ message: `Arrears calculated for ${summary.rows.length} students` })

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /arrears/:section_id
router.get('/:section_id', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        sa.*,
        u.email AS student_email
       FROM student_arrears sa
       JOIN users u ON sa.student_id = u.id
       WHERE sa.section_id = $1
       ORDER BY sa.attendance_percentage ASC`,
      [req.params.section_id]
    )
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router