import { Router } from 'express'
import { authenticateToken } from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'
import { imageUpload, validateUploadedImage } from '../middleware/uploadMiddleware.js'
import { requireVoucherState } from '../middleware/voucherGuard.js'
import { approveVoucher, createVoucher, deleteVoucher, getVoucher, getVoucherSignature, listVouchers, rejectVoucher, submitVoucher, updateVoucher } from '../controllers/voucherController.js'

const router = Router()
router.use(authenticateToken)
router.get('/', listVouchers)
router.get('/:id', getVoucher)
router.get('/:id/signatures/:kind', getVoucherSignature)
router.post('/', requireRole('EMPLOYEE'), imageUpload.single('employeeSignature'), validateUploadedImage, createVoucher)
router.put('/:id', requireRole('EMPLOYEE'), requireVoucherState('DRAFT', true), imageUpload.single('employeeSignature'), validateUploadedImage, updateVoucher)
router.delete('/:id', requireRole('EMPLOYEE'), requireVoucherState('DRAFT', true), deleteVoucher)
router.post('/:id/submit', requireRole('EMPLOYEE'), requireVoucherState('DRAFT', true), submitVoucher)
router.post('/:id/approve', requireRole('DIRECTOR'), requireVoucherState('PENDING_APPROVAL'), imageUpload.single('directorSignature'), validateUploadedImage, approveVoucher)
router.post('/:id/reject', requireRole('DIRECTOR'), rejectVoucher)

export default router
