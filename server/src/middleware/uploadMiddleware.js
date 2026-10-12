import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import multer from 'multer'
import { fileURLToPath } from 'node:url'

export const uploadDirectory = path.resolve(
  process.env.UPLOAD_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '../../uploads')
)

await fs.mkdir(uploadDirectory, { recursive: true })

const allowedTypes = new Map([
  ['image/png', { extension: '.png', matches: (bytes) => bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) }],
  ['image/jpeg', { extension: '.jpg', matches: (bytes) => bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])) }],
  ['image/gif', { extension: '.gif', matches: (bytes) => bytes.subarray(0, 6).toString('ascii') === 'GIF87a' || bytes.subarray(0, 6).toString('ascii') === 'GIF89a' }],
  ['image/webp', { extension: '.webp', matches: (bytes) => bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP' }],
])

const storage = multer.diskStorage({
  destination: uploadDirectory,
  filename: (_req, file, callback) => {
    const type = allowedTypes.get(file.mimetype)
    callback(null, `${crypto.randomUUID()}${type.extension}`)
  },
})

export const imageUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const type = allowedTypes.get(file.mimetype)
    const extension = path.extname(file.originalname).toLowerCase()
    if (!type || extension !== type.extension) {
      return callback(new Error('Only valid PNG, JPEG, GIF, or WEBP images are allowed.'))
    }
    callback(null, true)
  },
})

export async function validateUploadedImage(req, res, next) {
  if (!req.file) return next()

  try {
    const type = allowedTypes.get(req.file.mimetype)
    const bytes = await fs.readFile(req.file.path)
    if (!type || !type.matches(bytes)) {
      await fs.rm(req.file.path, { force: true })
      return res.status(400).json({ success: false, message: 'The uploaded signature is not a valid image.' })
    }
    next()
  } catch (error) {
    await fs.rm(req.file.path, { force: true }).catch(() => {})
    next(error)
  }
}
