import 'dotenv/config'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import pool from './config/db.js'

const demoUsers = [
  {
    name: 'Demo Employee',
    email: 'demo.employee@example.com',
    role: 'EMPLOYEE',
    department: 'Engineering',
    employeeCode: 'DEMO-EMP',
  },
  {
    name: 'Demo Director',
    email: 'demo.director@example.com',
    role: 'DIRECTOR',
    department: 'Administration',
  },
  {
    name: 'Demo Accounts',
    email: 'demo.accounts@example.com',
    role: 'ACCOUNTS',
    department: 'Finance',
  },
]

function createPassword() {
  return `Demo-${crypto.randomBytes(12).toString('base64url')}`
}

async function seedDemoUsers() {
  const created = []

  try {
    for (const demoUser of demoUsers) {
      const [existing] = await pool.execute(
        'SELECT id FROM users WHERE email = ? LIMIT 1',
        [demoUser.email]
      )

      if (existing.length > 0) {
        console.log(`Skipped existing demo account: ${demoUser.email}`)
        continue
      }

      const password = createPassword()
      const passwordHash = await bcrypt.hash(password, 12)
      await pool.execute(
        `INSERT INTO users
          (full_name, email, password_hash, employee_code, department, role)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          demoUser.name,
          demoUser.email,
          passwordHash,
          demoUser.employeeCode || null,
          demoUser.department,
          demoUser.role,
        ]
      )
      created.push({ email: demoUser.email, role: demoUser.role, password })
    }

    if (created.length) {
      console.log('\nSave these credentials locally; they are not written to a file:\n')
      for (const account of created) {
        console.log(`${account.role}: ${account.email} / ${account.password}`)
      }
    } else {
      console.log('\nNo new demo accounts were created.')
    }
  } catch (error) {
    console.error('Demo account seeding failed:', error.message)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

seedDemoUsers()
