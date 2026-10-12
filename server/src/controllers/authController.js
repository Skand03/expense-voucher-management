import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

export async function login(req, res) {
    try {
        const { email, password } = req.body;

        if (
            typeof email !== 'string' ||
            typeof password !== 'string' ||
            !email.trim() ||
            !password
        ) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required.',
            })
        }

        if (!process.env.JWT_SECRET) {
            console.error('JWT_SECRET is not configured.')
            return res.status(500).json({
                success: false,
                message: 'Server configuration error.',
            })
        }

        const [users] = await pool.execute(
            `select id, full_name, email, password_hash, employee_code, department, role, is_active from users where email = ? LIMIT 1`,
            [email.trim().toLowerCase()]
        )

        const user = users[0]

        if (!user || !user.is_active) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password.',
            })
        }

        const passwordMatches = await bcrypt.compare(
            password,
            user.password_hash
        )


        if (!passwordMatches) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password.',
            })
        }

        const token = jwt.sign(
            { sub: String(user.id) },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
        )

        return res.status(200).json({
            success: true,
            message: 'Login successful.',
            token,
            user: {
                id: user.id,
                fullName: user.full_name,
                email: user.email,
                employeeCode: user.employee_code,
                department: user.department,
                role: user.role,
            },
        })
    } catch (error) {
        console.error('Login error:', error.message)

        return res.status(500).json({
            success: false,
            message: 'An unexpected error occurred.',
        })
    }
}

export async function getCurrentUser(req, res) {
    try {
        const [users] = await pool.execute(
            `SELECT id, full_name, email, employee_code,
              department, role, is_active
       FROM users
       WHERE id = ?
       LIMIT 1`,
            [req.user.id]
        )

        const user = users[0]

        if (!user || !user.is_active) {
            return res.status(401).json({
                success: false,
                message: 'Account is unavailable.',
            })
        }

        return res.status(200).json({
            success: true,
            user: {
                id: user.id,
                fullName: user.full_name,
                email: user.email,
                employeeCode: user.employee_code,
                department: user.department,
                role: user.role,
            },
        })
    } catch (error) {
        console.error('Current user error:', error.message)

        return res.status(500).json({
            success: false,
            message: 'An unexpected error occurred.',
        })
    }
}