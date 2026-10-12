import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import fs from 'node:fs/promises'
import jwt from 'jsonwebtoken'
import mysql from 'mysql2/promise'
import request from 'supertest'
import { after, before, describe, it } from 'node:test'
import 'dotenv/config'

const developmentDatabase = process.env.DB_NAME || 'expense_voucher_db'
const testDatabase = process.env.TEST_DB_NAME || `${developmentDatabase}_test`

if (testDatabase === developmentDatabase) {
  throw new Error('TEST_DB_NAME must be different from DB_NAME.')
}

process.env.DB_NAME = testDatabase
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret'
process.env.UPLOAD_DIR = new URL('../uploads-test/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

const adminConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
}

let admin
let pool
let app
let employeeToken
let secondEmployeeToken
let directorToken
let accountsToken
let employeeId
let secondEmployeeId
let draftId
let submittedId

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

async function login(email, password) {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password })
  return response
}

function voucherForm(includeSignature = true) {
  const form = request(app)
    .post('/api/vouchers')
    .field('voucherDate', '2026-10-11')
    .field('expenseDate', '2026-10-10')
    .field('department', 'Engineering')
    .field('expenseTitle', 'Test travel')
    .field('expenseCategory', 'Travel')
    .field('expenseDescription', 'Automated test')
    .field('amount', '100')
    .set('Authorization', `Bearer ${employeeToken}`)

  if (includeSignature) form.attach('employeeSignature', signature, { filename: 'employee.png', contentType: 'image/png' })
  return form
}

before(async () => {
  admin = await mysql.createConnection(adminConfig)
  await admin.query(`CREATE DATABASE IF NOT EXISTS \`${testDatabase}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
  await admin.changeUser({ ...adminConfig, database: testDatabase })
  await admin.query('SET FOREIGN_KEY_CHECKS = 0')
  await admin.query('DROP TABLE IF EXISTS vouchers')
  await admin.query('DROP TABLE IF EXISTS users')
  await admin.query('SET FOREIGN_KEY_CHECKS = 1')
  await admin.query(`
    CREATE TABLE users (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      full_name VARCHAR(100) NOT NULL,
      email VARCHAR(150) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      employee_code VARCHAR(50) UNIQUE,
      department VARCHAR(100),
      role ENUM('EMPLOYEE','DIRECTOR','ACCOUNTS') NOT NULL DEFAULT 'EMPLOYEE',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `)
  await admin.query(`
    CREATE TABLE vouchers (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      voucher_number VARCHAR(40) NOT NULL UNIQUE,
      voucher_date DATE NOT NULL,
      expense_date DATE NOT NULL,
      department VARCHAR(100) NOT NULL,
      expense_title VARCHAR(200) NOT NULL,
      expense_category VARCHAR(100) NOT NULL,
      expense_description TEXT,
      amount DECIMAL(12,2) NOT NULL,
      created_by INT UNSIGNED NOT NULL,
      employee_signature VARCHAR(255),
      status ENUM('DRAFT','PENDING_APPROVAL','APPROVED','REJECTED') NOT NULL DEFAULT 'DRAFT',
      approved_by INT UNSIGNED NULL,
      director_signature VARCHAR(255),
      approval_date DATETIME NULL,
      rejection_reason TEXT NULL,
      submitted_at DATETIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CHECK (amount > 0),
      FOREIGN KEY (created_by) REFERENCES users(id),
      FOREIGN KEY (approved_by) REFERENCES users(id)
    )
  `)

  const passwordHash = await bcrypt.hash('TestPassword123!', 4)
  const users = [
    ['Employee One', 'employee.one@test.local', 'E1', 'EMPLOYEE', 'Engineering'],
    ['Employee Two', 'employee.two@test.local', 'E2', 'EMPLOYEE', 'Engineering'],
    ['Test Director', 'director@test.local', null, 'DIRECTOR', 'Administration'],
    ['Test Accounts', 'accounts@test.local', null, 'ACCOUNTS', 'Finance'],
  ]
  for (const user of users) {
    const [result] = await admin.execute(
      'INSERT INTO users (full_name,email,password_hash,employee_code,role,department) VALUES (?,?,?,?,?,?)',
      [user[0], user[1], passwordHash, user[2], user[3], user[4]]
    )
    if (user[1] === 'employee.one@test.local') employeeId = result.insertId
    if (user[1] === 'employee.two@test.local') secondEmployeeId = result.insertId
  }

  const imported = await import('../src/app.js')
  const db = await import('../src/config/db.js')
  app = imported.default
  pool = db.default

  employeeToken = (await login('employee.one@test.local', 'TestPassword123!')).body.token
  secondEmployeeToken = (await login('employee.two@test.local', 'TestPassword123!')).body.token
  directorToken = (await login('director@test.local', 'TestPassword123!')).body.token
  accountsToken = (await login('accounts@test.local', 'TestPassword123!')).body.token
})

after(async () => {
  await pool.end()
  await admin.end()
  const cleanup = await mysql.createConnection(adminConfig)
  await cleanup.query(`DROP DATABASE IF EXISTS \`${testDatabase}\``)
  await cleanup.end()
  await fs.rm(process.env.UPLOAD_DIR, { recursive: true, force: true })
})

describe('authentication and authorization', () => {
  it('logs in successfully and rejects bad credentials', async () => {
    const success = await login('employee.one@test.local', 'TestPassword123!')
    assert.equal(success.status, 200)
    assert.ok(success.body.token)
    const failure = await login('employee.one@test.local', 'wrong-password')
    assert.equal(failure.status, 401)
  })

  it('rejects missing, invalid, and expired JWTs', async () => {
    assert.equal((await request(app).get('/api/vouchers')).status, 401)
    assert.equal((await request(app).get('/api/vouchers').set('Authorization', 'Bearer invalid')).status, 401)
    const expired = jwt.sign({ sub: String(employeeId) }, process.env.JWT_SECRET, { expiresIn: -1 })
    assert.equal((await request(app).get('/api/vouchers').set('Authorization', `Bearer ${expired}`)).status, 401)
  })

  it('allows only the correct role to mutate vouchers', async () => {
    const directorCreate = await request(app).post('/api/vouchers').set('Authorization', `Bearer ${directorToken}`)
    const accountsCreate = await request(app).post('/api/vouchers').set('Authorization', `Bearer ${accountsToken}`)
    assert.equal(directorCreate.status, 403)
    assert.equal(accountsCreate.status, 403)
  })
})

describe('voucher ownership and workflow', () => {
  it('requires an employee signature before submission', async () => {
    const response = await voucherForm(false)
    draftId = response.body.id
    const submit = await request(app).post(`/api/vouchers/${draftId}/submit`).set('Authorization', `Bearer ${employeeToken}`)
    assert.equal(submit.status, 400)
  })

  it('creates drafts and prevents cross-employee access', async () => {
    const response = await voucherForm()
    assert.equal(response.status, 201)
    draftId = response.body.id
    const otherUser = await request(app).get(`/api/vouchers/${draftId}`).set('Authorization', `Bearer ${secondEmployeeToken}`)
    assert.equal(otherUser.status, 404)
    const own = await request(app).get(`/api/vouchers/${draftId}`).set('Authorization', `Bearer ${employeeToken}`)
    assert.equal(own.status, 200)
  })

  it('allows draft editing/deletion only to the owner', async () => {
    const otherEdit = await request(app).put(`/api/vouchers/${draftId}`).set('Authorization', `Bearer ${secondEmployeeToken}`)
    assert.equal(otherEdit.status, 404)
    const deleted = await request(app).delete(`/api/vouchers/${draftId}`).set('Authorization', `Bearer ${employeeToken}`)
    assert.equal(deleted.status, 200)
  })

  it('requires a signature, submits, and blocks employee edits after submission', async () => {
    const response = await voucherForm()
    submittedId = response.body.id
    const submit = await request(app).post(`/api/vouchers/${submittedId}/submit`).set('Authorization', `Bearer ${employeeToken}`)
    assert.equal(submit.status, 200)
    const update = await request(app).put(`/api/vouchers/${submittedId}`).set('Authorization', `Bearer ${employeeToken}`)
    assert.equal(update.status, 404)
  })

  it('requires a director signature and permits approval only to directors', async () => {
    const noSignature = await request(app).post(`/api/vouchers/${submittedId}/approve`).set('Authorization', `Bearer ${directorToken}`)
    assert.equal(noSignature.status, 400)
    const accounts = await request(app).post(`/api/vouchers/${submittedId}/approve`).set('Authorization', `Bearer ${accountsToken}`)
    assert.equal(accounts.status, 403)
    const approved = await request(app).post(`/api/vouchers/${submittedId}/approve`).set('Authorization', `Bearer ${directorToken}`)
      .attach('directorSignature', signature, { filename: 'director.png', contentType: 'image/png' })
    assert.equal(approved.status, 200)
  })

  it('requires a rejection reason and exposes rejected vouchers to their owner', async () => {
    const response = await voucherForm()
    const id = response.body.id
    await request(app).post(`/api/vouchers/${id}/submit`).set('Authorization', `Bearer ${employeeToken}`)
    const missingReason = await request(app).post(`/api/vouchers/${id}/reject`).set('Authorization', `Bearer ${directorToken}`).send({})
    assert.equal(missingReason.status, 400)
    const rejected = await request(app).post(`/api/vouchers/${id}/reject`).set('Authorization', `Bearer ${directorToken}`).send({ rejectionReason: 'Receipt missing.' })
    assert.equal(rejected.status, 200)
    const own = await request(app).get(`/api/vouchers/${id}`).set('Authorization', `Bearer ${employeeToken}`)
    assert.equal(own.body.voucher.rejectionReason, 'Receipt missing.')
  })

  it('keeps signatures protected by authentication and ownership', async () => {
    const response = await voucherForm()
    const id = response.body.id
    const anonymous = await request(app).get(`/api/vouchers/${id}/signatures/employee`)
    assert.equal(anonymous.status, 401)
    const other = await request(app).get(`/api/vouchers/${id}/signatures/employee`).set('Authorization', `Bearer ${secondEmployeeToken}`)
    assert.equal(other.status, 404)
    const owner = await request(app).get(`/api/vouchers/${id}/signatures/employee`).set('Authorization', `Bearer ${employeeToken}`)
    assert.equal(owner.status, 200)
  })

  it('rejects files whose content does not match their image MIME type', async () => {
    const response = await request(app)
      .post('/api/vouchers')
      .set('Authorization', `Bearer ${employeeToken}`)
      .field('voucherDate', '2026-10-11')
      .field('expenseDate', '2026-10-10')
      .field('department', 'Engineering')
      .field('expenseTitle', 'Invalid signature')
      .field('expenseCategory', 'Travel')
      .field('amount', '100')
      .attach('employeeSignature', Buffer.from('not-a-png'), { filename: 'signature.png', contentType: 'image/png' })
    assert.equal(response.status, 400)
  })

  it('returns paginated and whitelisted sorted results', async () => {
    const response = await request(app)
      .get('/api/vouchers?sort=amount&direction=ASC&page=1&pageSize=1')
      .set('Authorization', `Bearer ${directorToken}`)
    assert.equal(response.status, 200)
    assert.equal(response.body.pagination.pageSize, 1)
    assert.ok(response.body.pagination.total >= 1)
  })
})
