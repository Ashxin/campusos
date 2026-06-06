const express = require('express')
const router = express.Router()
const pool = require('../config/db')
const authenticate = require('../middleware/auth')


router.get('/at-risk', authenticate, async(req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.email, sec.section_name, sa.attendance_percentage
        FROM student_arrears sa
        JOIN users u ON sa.student_id = u.id
        JOIN sections sec ON sa.section_id = sec.id
        WHERE sa.is_in_arrears = true
        ORDER BY sa.attendance_percentage ASC`
    )
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/section/:section_id', authenticate, async(req, res) => {
  try {
  const enrolled = await pool.query(
    `SELECT COUNT(*) FROM enrollments WHERE section_id = $1`, [req.params.section_id]
  )
const classes = await pool.query(
  `SELECT COUNT(DISTINCT date) 
    FROM attendance_records ar
    JOIN enrollments e ON ar.enrollment_id = e.id
    WHERE e.section_id = $1`, [req.params.section_id]
)
const avgAttendance = await pool.query(
  `SELECT ROUND(AVG(attendance_percentage), 2) FROM student_arrears WHERE section_id = $1`, [req.params.section_id]
)
const atRisk = await pool.query(
  `SELECT COUNT(*) FROM student_arrears WHERE is_in_arrears = true AND section_id = $1`, [req.params.section_id]
)
  

res.json({
  total_enrolled: enrolled.rows[0].count,
  total_classes_held: classes.rows[0].count,
  average_attendance: avgAttendance.rows[0].round,
  students_in_arrears: atRisk.rows[0].count
})
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})


router.get('/programme/:programme_id', authenticate, async (req, res) => {
  try {
  const totalSections = await pool.query(
    `SELECT COUNT(*) FROM sections JOIN courses ON sections.course_id = courses.id WHERE courses.programme_id = $1`, [req.params.programme_id]
  )
  const enrolled = await pool.query(
    `SELECT COUNT(*) 
      FROM enrollments e
      JOIN sections s ON e.section_id = s.id
      JOIN courses c ON s.course_id = c.id
      WHERE c.programme_id = $1`, [req.params.programme_id]
  )
  const atRisk = await pool.query(
    ` SELECT COUNT(*) 
        FROM student_arrears e
        JOIN sections s ON e.section_id = s.id
        JOIN courses c ON s.course_id = c.id
        WHERE c.programme_id = $1`, [req.params.programme_id]
  )
  res.json ({
    total_sections: totalSections.rows[0].count,
    total_enrolled: enrolled.rows[0].count,
    students_in_arrears: atRisk.rows[0].count
  })
} catch (err) {
    res.status(500).json({ error: err.message })
  } 
})

module.exports = router