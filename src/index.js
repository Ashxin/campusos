const express = require('express')
const app = express()
require('dotenv').config()

const authenticate = require('./middleware/auth')
const authRoutes = require('./routes/auth')

app.use(express.json()) // without this, req.body is undefined. Express doesnt parse incoming JSON automatically. This middleware reads the raw request body and converts it to a JS object. It must come before your routes

app.use('/auth', authRoutes) //mounts your auth router at /auth. this means router.post('/register') inside auth.js becomes POST /auth/register. you are composing routes, not hardcoding them all in one file

app.get('/me', authenticate, (req, res) => {
  res.json({ message: 'You are authenticated', user: req.user })
}) // notice the three arguments. authenticate is middleware string sitting between the route definition and the handler. express runs it first, if it calls next(), the handler runs. if it returns a 401/403, the handler never runs

app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
}) // a simple endpoint that confirms your server is alive. no auth needed, u will use this in deployement later

const PORT = process.env.PORT || 3000 // on platforms like railway or render, they inject their own PORT, the \\ 3000 is our local fallback
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))