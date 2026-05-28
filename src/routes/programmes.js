const express = require('express')
const router = express.Router()
const pool = require('../config/db')
const authenticate = require('../middleware/auth')
const authorize = require('../middleware/authorize')
const { error } = require('node:console')

//GET all programmes - any authenticated user
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM programmes ORDER BY created_at DESC'
    )
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

//GET one programme by id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM programmes WHERE id = $1',
      [req.params.id]
    )
    if(result.rows.length === 0) {
      return res.status(404).json({ error: 'Programme not found'})
    }
    res.json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

//POST create programme - admin only
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  const { name, code, duration_years } = req.body

  if(!name || !code || !duration_years) {
    return res.status(400).json({error: 'name, code and duration_years are required'})
  }
  try {
    const result = await pool.query(
      'INSERT INTO programmes (name, code, duration_years) VALUES ($1, $2, $3) RETURNING *', [name, code, duration_years]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ erro: 'Programme name or code already exists'})
    }
    res.status(500).json({ error: err.message })
  }
})

// PUT update programme - admin only
router.put('/:id', authenticate, authorize('admin'), async (req, res) => {
  const { name, code, duration_years }= req.body
  try { // The PUT route COALESCE, this means use the new value if provided, otherwise keep the existing column value. so a client can send just name: B.tech CSE without sending code or duration_years- the other fields stay untouched. Without COALESCE, sending a partial update would overwrite the missing fields with NULL and corrupt your data.
    const result = await pool.query(
      `UPDATE programmes
      SET name = COALESCE($1, name),
        code = COALESCE($2, code),
        duration_years = COALESCE($3, duration_years)
      WHERE id = $4
      RETURNING *`,
      [name, code, duration_years, req.params.id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Programme not found' })
    }
    res.json(result.rows[0])
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ erro: 'Programme name or code already exists' })
    }
    res.status(500).json({ erro: err.message })
  }
})

//DELETE programme - admin only
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM programme WHERE id = $1 RETURNING *', [req.params.id]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Programme not found' })
    }
    res.json({ message: 'Programme deleted', programme: result.rows[0]})
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router