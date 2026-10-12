import pool from '../config/db.js'
import fs from 'node:fs'
import path from 'node:path'
import { uploadDirectory } from '../middleware/uploadMiddleware.js'

const selectVoucher = `
  SELECT v.*, u.id AS employee_id, u.full_name AS employee_name,
    u.email AS employee_email, u.employee_code
  FROM vouchers v JOIN users u ON u.id = v.created_by
`

function serialize(row) {
  return {
    id: row.id, voucherNumber: row.voucher_number, voucherDate: row.voucher_date,
    expenseDate: row.expense_date, department: row.department, expenseTitle: row.expense_title,
    expenseCategory: row.expense_category, expenseDescription: row.expense_description,
    amount: Number(row.amount), status: row.status, employeeSignature: row.employee_signature,
    directorSignature: row.director_signature, approvalDate: row.approval_date,
    rejectionReason: row.rejection_reason, submittedAt: row.submitted_at,
    createdAt: row.created_at, updatedAt: row.updated_at, directorId: row.approved_by,
    employee: { id: row.employee_id, name: row.employee_name, email: row.employee_email, employeeCode: row.employee_code },
  }
}

function validate(body) {
  const required = ['voucherDate', 'expenseDate', 'department', 'expenseTitle', 'expenseCategory', 'amount']
  const missing = required.filter((name) => !String(body[name] ?? '').trim())
  if (missing.length) return `Missing required fields: ${missing.join(', ')}.`
  if (!Number.isFinite(Number(body.amount)) || Number(body.amount) <= 0) return 'Amount must be greater than zero.'
  return null
}

export async function listVouchers(req, res) {
  try {
    const { status, search, department, category, from, to, minAmount, maxAmount } = req.query
    const allowedStatuses = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED']
    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid voucher status.' })
    }
    if (from && Number.isNaN(Date.parse(from))) {
      return res.status(400).json({ success: false, message: 'Invalid start date.' })
    }
    if (to && Number.isNaN(Date.parse(to))) {
      return res.status(400).json({ success: false, message: 'Invalid end date.' })
    }
    const minimum = minAmount === undefined || minAmount === '' ? null : Number(minAmount)
    const maximum = maxAmount === undefined || maxAmount === '' ? null : Number(maxAmount)
    if (minimum !== null && (!Number.isFinite(minimum) || minimum < 0)) {
      return res.status(400).json({ success: false, message: 'Minimum amount must be a non-negative number.' })
    }
    if (maximum !== null && (!Number.isFinite(maximum) || maximum < 0)) {
      return res.status(400).json({ success: false, message: 'Maximum amount must be a non-negative number.' })
    }
    if (minimum !== null && maximum !== null && minimum > maximum) {
      return res.status(400).json({ success: false, message: 'Minimum amount cannot exceed maximum amount.' })
    }
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1)
    const pageSize = Math.min(Math.max(Number.parseInt(req.query.pageSize, 10) || 25, 1), 100)
    const sortColumns = {
      voucherDate: 'v.voucher_date',
      expenseDate: 'v.expense_date',
      amount: 'v.amount',
      status: 'v.status',
      createdAt: 'v.created_at',
    }
    const sortColumn = sortColumns[req.query.sort] || 'v.created_at'
    const direction = String(req.query.direction).toUpperCase() === 'ASC' ? 'ASC' : 'DESC'
    const where = []
    const values = []
    if (req.user.role === 'EMPLOYEE') { where.push('v.created_by = ?'); values.push(req.user.id) }
    if (status) { where.push('v.status = ?'); values.push(status) }
    if (search) { where.push('(v.voucher_number LIKE ? OR v.expense_title LIKE ? OR u.full_name LIKE ?)'); values.push(`%${search}%`, `%${search}%`, `%${search}%`) }
    if (department) { where.push('v.department = ?'); values.push(department) }
    if (category) { where.push('v.expense_category = ?'); values.push(category) }
    if (from) { where.push('v.expense_date >= ?'); values.push(from) }
    if (to) { where.push('v.expense_date <= ?'); values.push(to) }
    if (minimum !== null) { where.push('v.amount >= ?'); values.push(minimum) }
    if (maximum !== null) { where.push('v.amount <= ?'); values.push(maximum) }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const [countRows] = await pool.execute(`SELECT COUNT(*) AS total ${selectVoucher.slice(selectVoucher.indexOf('FROM'))} ${whereClause}`, values)
    const total = Number(countRows[0].total)
    values.push(pageSize, (page - 1) * pageSize)
    const [rows] = await pool.execute(`${selectVoucher} ${whereClause} ORDER BY ${sortColumn} ${direction} LIMIT ? OFFSET ?`, values)
    const statisticsWhere = req.user.role === 'EMPLOYEE' ? 'WHERE created_by = ?' : ''
    const statisticsValues = req.user.role === 'EMPLOYEE' ? [req.user.id] : []
    const [statisticsRows] = await pool.execute(
      `SELECT COUNT(*) AS total, COALESCE(SUM(amount), 0) AS amount,
        SUM(status = 'DRAFT') AS drafts, SUM(status = 'PENDING_APPROVAL') AS pending,
        SUM(status = 'APPROVED') AS approved, SUM(status = 'REJECTED') AS rejected,
        COALESCE(SUM(CASE WHEN status = 'PENDING_APPROVAL' THEN amount ELSE 0 END), 0) AS pending_amount,
        COALESCE(SUM(CASE WHEN status = 'APPROVED' THEN amount ELSE 0 END), 0) AS approved_amount,
        SUM(status = 'APPROVED' AND DATE(approval_date) = CURDATE()) AS approved_today,
        SUM(status = 'REJECTED' AND DATE(approval_date) = CURDATE()) AS rejected_today
       FROM vouchers ${statisticsWhere}`,
      statisticsValues
    )
    const statistics = statisticsRows[0]
    return res.json({
      success: true,
      vouchers: rows.map(serialize),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      statistics: {
        total: Number(statistics.total), amount: Number(statistics.amount),
        drafts: Number(statistics.drafts), pending: Number(statistics.pending),
        approved: Number(statistics.approved), rejected: Number(statistics.rejected),
        pendingAmount: Number(statistics.pending_amount),
        approvedAmount: Number(statistics.approved_amount),
        approvedToday: Number(statistics.approved_today),
        rejectedToday: Number(statistics.rejected_today),
      },
    })
  } catch (error) {
    console.error('List vouchers error:', error.message)
    return res.status(500).json({ success: false, message: 'Unable to load vouchers.' })
  }
}

export async function getVoucher(req, res) {
  try {
    const [rows] = await pool.execute(`${selectVoucher} WHERE v.id = ? LIMIT 1`, [req.params.id])
    const voucher = rows[0]
    if (!voucher || (req.user.role === 'EMPLOYEE' && voucher.created_by !== req.user.id)) return res.status(404).json({ success: false, message: 'Voucher not found.' })
    return res.json({ success: true, voucher: serialize(voucher) })
  } catch (error) {
    console.error('Get voucher error:', error.message)
    return res.status(500).json({ success: false, message: 'Unable to load voucher.' })
  }
}

export async function getVoucherSignature(req, res) {
    const kind = req.params.kind
    if (!['employee', 'director'].includes(kind)) {
      return res.status(400).json({ success: false, message: 'Invalid signature type.' })
    }
    const [rows] = await pool.execute(
      `SELECT created_by, employee_signature, director_signature FROM vouchers WHERE id = ? LIMIT 1`,
      [req.params.id]
    )
    const voucher = rows[0]
    if (!voucher || (req.user.role === 'EMPLOYEE' && voucher.created_by !== req.user.id)) {
      return res.status(404).json({ success: false, message: 'Voucher not found.' })
    }
    const signature = kind === 'employee' ? voucher.employee_signature : voucher.director_signature
    const filename = signature && path.basename(signature)
    if (!filename || filename !== signature.split('/').pop() || !fs.existsSync(path.join(uploadDirectory, filename))) {
      return res.status(404).json({ success: false, message: 'Signature not found.' })
    }
    return res.sendFile(filename, { root: uploadDirectory })
}

export async function createVoucher(req, res) {
  try {
    const error = validate(req.body)
    if (error) {
      if (req.file) fs.rmSync(req.file.path, { force: true })
      return res.status(400).json({ success: false, message: error })
    }
    const [result] = await pool.execute(
      `INSERT INTO vouchers (voucher_number, voucher_date, expense_date, department, expense_title, expense_category, expense_description, amount, created_by, employee_signature) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [`EV-${Date.now()}-${Math.floor(Math.random() * 1000)}`, req.body.voucherDate, req.body.expenseDate, req.body.department.trim(), req.body.expenseTitle.trim(), req.body.expenseCategory.trim(), req.body.expenseDescription?.trim() || null, Number(req.body.amount), req.user.id, req.file ? `/uploads/${req.file.filename}` : null]
    )
    return res.status(201).json({ success: true, id: result.insertId, message: 'Voucher saved as draft.' })
  } catch (error) {
    if (req.file) fs.rmSync(req.file.path, { force: true })
    console.error('Create voucher error:', error.message)
    return res.status(500).json({ success: false, message: 'Unable to create voucher.' })
  }
}

export async function updateVoucher(req, res) {
  try {
    const error = validate(req.body)
    if (error) {
      if (req.file) fs.rmSync(req.file.path, { force: true })
      return res.status(400).json({ success: false, message: error })
    }
    const [result] = await pool.execute(
      `UPDATE vouchers SET voucher_date = ?, expense_date = ?, department = ?, expense_title = ?, expense_category = ?, expense_description = ?, amount = ?, employee_signature = COALESCE(?, employee_signature) WHERE id = ? AND created_by = ? AND status = 'DRAFT'`,
      [req.body.voucherDate, req.body.expenseDate, req.body.department.trim(), req.body.expenseTitle.trim(), req.body.expenseCategory.trim(), req.body.expenseDescription?.trim() || null, Number(req.body.amount), req.file ? `/uploads/${req.file.filename}` : null, req.params.id, req.user.id]
    )
    if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Only your draft voucher can be edited.' })
    return res.json({ success: true, message: 'Draft updated.' })
  } catch (error) {
    if (req.file) fs.rmSync(req.file.path, { force: true })
    console.error('Update voucher error:', error.message)
    return res.status(500).json({ success: false, message: 'Unable to update voucher.' })
  }
}

export async function deleteVoucher(req, res) {
  try {
    const [result] = await pool.execute(`DELETE FROM vouchers WHERE id = ? AND created_by = ? AND status = 'DRAFT'`, [req.params.id, req.user.id])
    if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Only your draft voucher can be deleted.' })
    return res.json({ success: true, message: 'Draft deleted.' })
  } catch (error) {
    console.error('Delete voucher error:', error.message)
    return res.status(500).json({ success: false, message: 'Unable to delete voucher.' })
  }
}

export async function submitVoucher(req, res) {
  const [rows] = await pool.execute(`SELECT employee_signature, status FROM vouchers WHERE id = ? AND created_by = ? LIMIT 1`, [req.params.id, req.user.id])
  const voucher = rows[0]
  if (!voucher) return res.status(404).json({ success: false, message: 'Voucher not found.' })
  if (voucher.status !== 'DRAFT') return res.status(409).json({ success: false, message: 'Only drafts can be submitted.' })
  if (!voucher.employee_signature) return res.status(400).json({ success: false, message: 'Employee signature is required before submission.' })
  await pool.execute(`UPDATE vouchers SET status = 'PENDING_APPROVAL', submitted_at = NOW() WHERE id = ?`, [req.params.id])
  return res.json({ success: true, message: 'Voucher submitted for approval.' })
}

export async function approveVoucher(req, res) {
  if (!req.file) return res.status(400).json({ success: false, message: 'Director signature is required.' })
  const [result] = await pool.execute(`UPDATE vouchers SET status = 'APPROVED', approved_by = ?, director_signature = ?, approval_date = NOW(), rejection_reason = NULL WHERE id = ? AND status = 'PENDING_APPROVAL'`, [req.user.id, `/uploads/${req.file.filename}`, req.params.id])
  if (!result.affectedRows) {
    if (req.file) fs.rmSync(req.file.path, { force: true })
    return res.status(404).json({ success: false, message: 'Pending voucher not found.' })
  }
  return res.json({ success: true, message: 'Voucher approved.' })
}

export async function rejectVoucher(req, res) {
  const reason = req.body.rejectionReason?.trim()
  if (!reason) return res.status(400).json({ success: false, message: 'Rejection reason is required.' })
  const [result] = await pool.execute(`UPDATE vouchers SET status = 'REJECTED', rejection_reason = ?, approved_by = ?, approval_date = NOW() WHERE id = ? AND status = 'PENDING_APPROVAL'`, [reason, req.user.id, req.params.id])
  if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Pending voucher not found.' })
  return res.json({ success: true, message: 'Voucher rejected.' })
}
