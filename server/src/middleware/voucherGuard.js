import pool from '../config/db.js'

export function requireVoucherState(expectedStatus, ownerOnly = false) {
  return async (req, res, next) => {
    try {
      const [rows] = await pool.execute(
        'SELECT created_by, status FROM vouchers WHERE id = ? LIMIT 1',
        [req.params.id]
      )
      const voucher = rows[0]
      if (
        !voucher ||
        (ownerOnly && voucher.created_by !== req.user.id) ||
        (expectedStatus && voucher.status !== expectedStatus)
      ) {
        return res.status(404).json({ success: false, message: 'Voucher not found or is not available for this action.' })
      }
      next()
    } catch (error) {
      next(error)
    }
  }
}
