
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import authRoutes from './routes/authRoutes.js'
import voucherRoutes from './routes/voucherRoutes.js'

const app = express()

app.use(helmet())

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
}))

app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true }))
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'ok',
    message: 'Expense Voucher API is running',
  })
})

app.use('/api/auth', authRoutes)
app.use('/api/vouchers', voucherRoutes)

app.use((error, _req, res, _next) => {
  if (error?.code === 'LIMIT_FILE_SIZE' || error?.message?.includes('valid PNG')) {
    return res.status(400).json({ success: false, message: error.message })
  }
  console.error('Unhandled request error:', error)
  return res.status(500).json({ success: false, message: 'An unexpected server error occurred.' })
})

export default app
