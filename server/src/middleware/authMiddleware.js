
import jwt from 'jsonwebtoken'
import pool from '../config/db.js'

export async function authenticateToken(req, res, next) {
  try {
    const authorization = req.headers.authorization

    if (!authorization?.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      })
    }

    const token = authorization.slice(7).trim()

    if (!token || !process.env.JWT_SECRET) {
      return res.status(401).json({
        success: false,
        message: 'Invalid authentication token.',
      })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    if (
      typeof decoded === 'string' ||
      typeof decoded.sub !== 'string' ||
      !/^[1-9]\d*$/.test(decoded.sub)
    ) {
      return res.status(401).json({
        success: false,
        message: 'Invalid authentication token.',
      })
    }

    const [users] = await pool.execute(
      `SELECT id, full_name, email, role, is_active
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [decoded.sub]
    )

    const user = users[0]

    if (!user || !user.is_active) {
      return res.status(401).json({
        success: false,
        message: 'Account is unavailable.',
      })
    }

    req.user = {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      role: user.role,
    }

    next()
  } catch (error) {
    if (
      error.name === 'JsonWebTokenError' ||
      error.name === 'TokenExpiredError'
    ) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token.',
      })
    }

    console.error('Authentication error:', error.message)

    return res.status(500).json({
      success: false,
      message: 'Authentication could not be completed.',
    })
  }
}

export function allowRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      })
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to access this resource.',
      })
    }

    next()
  }
}
