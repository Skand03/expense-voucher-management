import { Router } from 'express'
import {
  login,
  getCurrentUser,
} from '../controllers/authController.js'
import {
  authenticateToken,
} from '../middleware/authMiddleware.js'

const router = Router()

router.post('/login', login)
router.get('/me', authenticateToken, getCurrentUser)

export default router