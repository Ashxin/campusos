const express = require('express')
const router = express.Router()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const pool = require('../config/db')
const { error } = require('node:console')
require('dotenv').config()

//REGISTER
router.post('/register', async (req, res) => {
  const { email, password, role } = req.body //destructuring, the user sent a JSON body, Express parsed it, this pulls out the three fields you need.

  if (!email || !password || !role) {
    return res.status(400).json({ error: 'email, password and role are required'})
  }
  try {
    const password_hash = await bcrypt.hash(password, 10) // the 10 is salt rounds, bcrypt runs the hashing algorithm 1024 time deliberately, this makes brute forcing passswords computationally expensive, even if your DB is stolen, cracking the passwords takes years
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role', // these are parameterized queries, never concatenate user input directly into sql strings like WHERE email = + email, Thats how SQl injection attacks work. THe pg library safely escapes your values when you use $1, $2
      //Returning id, email, role -- PostgreSQL retuns the inserted row. Notice password_hash is NOT int he returning clause, you never send the has back to the client ever.
      [email, password_hash, role]
    )
    res.status(201).json({ user: result.rows[0] })
  } catch (err) {
    if (err.code === '23505') { // this is postgreSQl's error code for unique constraint violation. When someone tries to register with an existing email, the DB throws this, you catch it and return a clean 409 insted of a cryptic 500 error
      return res.status(409).json({ error: 'Email already exists'})
    }
    res.status(500).json({ error: err.message })
  }
})

//LOGIN
router.post('/login', async (req, res) => {
  const { email, password} = req.body

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    )
    const user = result.rows[0]

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }
    const valid = await bcrypt.compare(password, user.password_hash) // bcrypt kows how to compare a plain password against a hash, you never decrypt the hash thats impossible by design. bcrypt rehashes the input and checks if they match
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const token = jwt.sign(
      {userId: user.id, role: user.role},
      process.env.JWT_SECRET,
      { expiresIn: '7d'}
    )
    res.json({ token, role: user.role })

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router