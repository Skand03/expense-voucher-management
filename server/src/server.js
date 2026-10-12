
import 'dotenv/config'
import app from './app.js'
import pool from './config/db.js'

const PORT = process.env.PORT || 5000

async function startServer() {
  try {
    await pool.query('SELECT 1')
    console.log('MySQL connected successfully')

    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`)
    })
  } catch (error) {
    console.error('Startup failed:', error.message)
    process.exit(1)
  }
}

startServer()
