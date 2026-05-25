const jwt = require('jsonwebtoken')
const { error } = require('node:console')
require('dotenv').config()

function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'] //when a logged in user makes a request, they send their token in the request header like this AuthorizationL Bearer ...., this line grabs the entire string.
  const token = authHeader && authHeader.split(' ')[1] // splits Bearer ... by the space, giving you bearer sperate and the string separate, index 1 is the aactual token and && means only try to split if authheader actually exists.

  if(!token) {
    return res.status(401).json({error: 'No token provided'}) // 401 means i dont know who u are, no token
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET) // this does two things at once, decodes the token AND verifies it hasnt been tampered with, even if one character is modified it throws an error
    req.user = decoded //attaches the decoded payload { userId: 3, role: "student" } to the rrequest object. Now any route that uses this middle ware can access req.user.userId and req.user.role without hitting the database again.
    next() // tells express this middleware is done move to next one, without this req hangs forever
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token'}) //403 means i know who u are but u are not allowed, bad token
  }
}

module.exports = authenticate