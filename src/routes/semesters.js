const express = require('express')
const router = express.Router()
const pool = require('../config/db')
const authenticate = require('../middleware/auth')
const authorize = require('../middleware/authorize')
const { error } = require('node:console')

// GET all semesters - optionally filter by programme
router.get('/', authenticate, async (req, res) => {
  try {
    const { programme_id } = req.query

    let query = `
      SELECT s.*, p.name AS programme_name, p.code AS programme_code
      FROM semesters s
      JOIN programmes p ON s.programme_id = p.id
    `
    const params = []

    if (programme_id) {
      query += ' WHERE s.programme_id = $1'
      params.push(programme_id)
    }

    query += ' ORDER BY s.programme_id, s.semester_number'

    const result = await pool.query(query, params)
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })    
  }
})

// GET one semester by id
router.get('/:id', authenticate, async (req, res) => {
  try { // FROM smesters s --- s is an alias, shorthand so you font type semesters repeatedly. JOIN programmes p ON s.programme_id = p.id -- for every smeester row, find the matching programme where IDs match and attach it. p.name AS programme_name - the programmes table alse has a name column. AS renames it in the response so it doesnt clash with s.name. Without the JOIN you would get back just IDs -- programme_id: 1. With the JOIN you get programme_name: B.tech - CSE. Thats the difference between data thats usable and data that requires a second request.
    const result = await pool.query(
      `SELECT s.*, p.name AS programme_name, p.code AS programme_code
      FROM semesters s
      JOIN programmes p on s.programme_id = p.id 
      WHERE s.id = $1`, [req.params.id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Semester not found' })
    }

    res.json(result.rows[0])
  } catch (error) {
    res.status(500).json({ error: err.message})
  }
})

// POST create semester - admin only
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  const { programme_id, name, semester_number, start_date, end_date } = req.body

  if(!programme_id || !name || !semester_number || !start_date || !end_date) {
    return res.status(400).json({ error: 'porgramme_id, name, semester_number, start_date and end_date are required '})
  }

  try {
    const result = await pool.query(
      `INSERT INTO semesters (programme_id, name, semester_number, start_date, end_date)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
       [programme_id, name, semester_number, start_date, end_date]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    if(err.code === '23505') {
      return res.status(409).json({ error: 'Semester number already exists for this programme'})
    }
    if (err.code === '23503') {
      return res.status(404).json({ error: 'Programme not found' })
    }
    res.status(500).json({ error: err.message })
  }
})

//PUT update semester - admin only
router.put('/:id', authenticate, authorize('admin'), async (req, res) => {
  const { name, semester_number, start_date, end_date, is_active} = req.body

  try {
    const result = await pool.query(
      `UPDATE semesters
       SET name            = COALESCE($1, name),
           semester_number = COALESCE($2, semester_number),
           start_date      = COALESCE($3, start_date),
           end_date        = COALESCE($4, end_date),
           is_active       = COALESCE($5, is_active)
       WHERE id = $6
       RETURNING *`,
      [name, semester_number, start_date, end_date, is_active, req.params.id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({error: 'Semester not found'})
    }
    res.json(result.rows[0])
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Semester number already exists for this programme' })
    }
    res.status(500).json({ error: err.message })
  }
})

//DELETE semster -admin only
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM semesters WHERE id = $1 RETURNING *',
      [req.params.id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Semester not found' })
    }

    res.json({ message: 'Semester deleted', semester: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router