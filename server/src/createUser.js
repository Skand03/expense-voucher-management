
import 'dotenv/config'
import bcrypt from 'bcryptjs'
import pool from './config/db.js'
async function createUser() {
  try {
    const {
      BOOTSTRAP_NAME,
      BOOTSTRAP_EMAIL,
      BOOTSTRAP_PASSWORD,
      BOOTSTRAP_ROLE,
      BOOTSTRAP_DEPARTMENT,
      BOOTSTRAP_EMPLOYEE_CODE,
    } = process.env

    const validRoles = ['EMPLOYEE', 'DIRECTOR', 'ACCOUNTS']

    if (
      !BOOTSTRAP_NAME?.trim() ||
      !BOOTSTRAP_EMAIL?.trim() ||
      !BOOTSTRAP_PASSWORD ||
      !validRoles.includes(BOOTSTRAP_ROLE)
    ) {
      throw new Error(
        'Set BOOTSTRAP_NAME, BOOTSTRAP_EMAIL, BOOTSTRAP_PASSWORD, and a valid BOOTSTRAP_ROLE.'
      )
    }

    if (BOOTSTRAP_PASSWORD.length < 12) {
      throw new Error('Use a password of at least 12 characters.')
    }

    const email = BOOTSTRAP_EMAIL.trim().toLowerCase()

    const [existing] = await pool.execute(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [email]
    )

    if (existing.length > 0) {
      throw new Error('A user with this email already exists.')
    }

    const passwordHash = await bcrypt.hash(
      BOOTSTRAP_PASSWORD,
      12
    )

    await pool.execute(
      `INSERT INTO users
        (full_name, email, password_hash, employee_code,
         department, role)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        BOOTSTRAP_NAME.trim(),
        email,
        passwordHash,
        BOOTSTRAP_EMPLOYEE_CODE?.trim() || null,
        BOOTSTRAP_DEPARTMENT?.trim() || null,
        BOOTSTRAP_ROLE,
      ]
    )

    console.log(`Created ${BOOTSTRAP_ROLE} account: ${email}`)
  } catch (error) {
    console.error('Account creation failed:', error.message)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

createUser()
