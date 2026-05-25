const { error } = require('node:console')
const { Pool } = require('pg') //pg is the postgresql client we have installed, pool is a connection pool, instead of opening and closing a DB connection on every request, it keeps a pool of open connections ready to use
require('dotenv').config() //this line reads our .env file and loads everything into process.ev, after this line process.env.DATABASE_URL exists.


// this creates the pool using our database URL from .env. This is not yet connecting just configuring.
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
})


pool.connect((err) => { // this tests the connection once when the server starts, i the password is wrong or postgresql isnt running, we will know immediately instead of at the first req.
  if (err) {
    console.error('Database connection failed:', err.message)
  } else {
    console.error('Connected to PostgreSQL')
  }
})

module.exports = pool //makes this pool available at any other file that does