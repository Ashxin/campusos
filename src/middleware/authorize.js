const { error } = require("node:console")

function authorize(...roles) { //takes any number of roles, so you can call it as authorize('admin') or authorize('admin', 'faculty'). the ... collects them into an array.
  return (req, res, next) => { // authorize doesnt run directly as middleware, it returns a middleware function. that returned function is what express actually calls. this is called a middleware factory -  a function that produces middleware
    if(!req.user) { // defensice check. authenticate should have set this, but if somehow authorize runs without authenticate before it, you catch it here.
      return res.status(401).json({ error: 'Not authenticated'})
    }
    if(!roles.includes(req.user.role)) { // checks if the users role is in tge allowed list, if not, 403, route handler never runs
      return res.status(403).json({ error: 'Insufficient permissions'})
    }
    next()
  }
}

module.exports = authorize