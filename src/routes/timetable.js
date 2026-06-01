const express = require('express')
const router = express.Router()
const pool = require('../config/db')
const authenticate = require('../middleware/auth')
const authorize = require('../middleware/authorize')


router.get('/', authenticate, async (req, res) => {
  try {
    const { section_id } = req.query

    let query = `
      SELECT t.*, sec.section_name FROM timetable_slots t JOIN sections sec ON t.section_id = sec.id
      `
    
    const params = []

    if (section_id) {
      query += ' WHERE t.section_id = $1'
      params.push(section_id)
    }

    const result = await pool.query(query, params)
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})


router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*, sec.section_name FROM timetable_slots t JOIN sections sec ON t.section_id = sec.id WHERE t.id = $1`, [req.params.id]
    )
    if(result.rows.length === 0) {
      return res.status(404).json({ error: 'Timetable slot not found' })
    }

    res.json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})


router.put('/:id', authenticate, authorize('admin'), async (req, res) => {
  const { section_id, day, start_time, end_time, room } = req.body

  try {
    const roomClash = await pool.query(
      `SELECT * FROM timetable_slots WHERE room= $1 AND day= $2 AND start_time < $3 AND end_time > $4 AND timetable_slots.id != $5`, [room, day, end_time, start_time, req.params.id]
    )
    if (roomClash.rows.length > 0) {
      return res.status(409).json({ error: 'Room already booked for this time' })
    }

    // Faculty clash check
    const facultyClash = await pool.query(
      `SELECT * FROM timetable_slots
        JOIN sections ON timetable_slots.section_id = sections.id
        WHERE  sections.faculty_id= $1 AND day= $2 AND start_time < $3 AND end_time > $4 AND timetable_slots.id != $5`, [section_id, day, end_time, start_time, req.params.id]
    )
    if (facultyClash.rows.length > 0) {
      return res.status(409).json({ error: 'Faculty already booked for this time' })
    }
    const result = await pool.query(
      `UPDATE timetable_slots
       SET section_id            = COALESCE($1, section_id),
           day = COALESCE($2, day),
           start_time      = COALESCE($3, start_time),
           end_time        = COALESCE($4, end_time),
           room       = COALESCE($5, room)
       WHERE id = $6
       RETURNING *`,
       [section_id, day, start_time, end_time, room, req.params.id]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({error: 'Timetable Slot not found'})
    }
    res.json(result.rows[0])
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Timetable Slot already exists' })
    }
    res.status(500).json({ error: err.message })
  }

})

router.post('/', authenticate, authorize('admin'), async (req, res) => {
  const { section_id, day, start_time, end_time, room } = req.body
  if (!section_id || !day || !room || !start_time || !end_time) {
    return res.status(400).json({ error: 'fields required' })
  }
  try {
  // Room clash check
    const roomClash = await pool.query(
      `SELECT * FROM timetable_slots WHERE room= $1 AND day= $2 AND start_time < $3 AND end_time > $4`, [room, day, end_time, start_time]
    )
    if (roomClash.rows.length > 0) {
      return res.status(409).json({ error: 'Room already booked for this time' })
    }

    // Faculty clash check
    const facultyClash = await pool.query(
      `SELECT * FROM timetable_slots
        JOIN sections ON timetable_slots.section_id = sections.id
        WHERE  sections.faculty_id= $1 AND day= $2 AND start_time < $3 AND end_time > $4`, [section_id, day, end_time, start_time]
    )
    if (facultyClash.rows.length > 0) {
      return res.status(409).json({ error: 'Faculty already booked for this time' })
    }
    const result = await pool.query(
      `INSERT INTO timetable_slots (section_id, day, start_time, end_time, room)
      VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [section_id, day, start_time, end_time, room]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM timetable_slots WHERE id = $1 RETURNING *',
      [req.params.id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Timetable Slot not found' })
    }

    res.json({ message: 'Timetable deleted', timetable_slots: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router