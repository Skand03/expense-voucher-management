
CREATE DATABASE IF NOT EXISTS expense_voucher_db
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE expense_voucher_db;

-- ==========================================
-- 1. USERS TABLE
-- ==========================================

CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,

    employee_code VARCHAR(50) UNIQUE,
    department VARCHAR(100),

    role ENUM(
        'EMPLOYEE',
        'DIRECTOR',
        'ACCOUNTS'
    ) NOT NULL DEFAULT 'EMPLOYEE',

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
);

-- ==========================================
-- 2. VOUCHERS TABLE
-- ==========================================

CREATE TABLE IF NOT EXISTS vouchers (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    voucher_number VARCHAR(40) NOT NULL UNIQUE,

    voucher_date DATE NOT NULL,
    expense_date DATE NOT NULL,

    department VARCHAR(100) NOT NULL,
    expense_title VARCHAR(200) NOT NULL,
    expense_category VARCHAR(100) NOT NULL,
    expense_description TEXT,

    amount DECIMAL(12, 2) NOT NULL,

    -- Employee who created the voucher
    created_by INT UNSIGNED NOT NULL,

    -- Employee signature image path
    employee_signature VARCHAR(255),

    status ENUM(
        'DRAFT',
        'PENDING_APPROVAL',
        'APPROVED',
        'REJECTED'
    ) NOT NULL DEFAULT 'DRAFT',

    -- Director approval information
    approved_by INT UNSIGNED NULL,
    director_signature VARCHAR(255),
    approval_date DATETIME NULL,

    -- Required when a voucher is rejected
    rejection_reason TEXT NULL,

    -- Workflow timestamp
    submitted_at DATETIME NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    -- Amount validation at database level
    CONSTRAINT chk_voucher_amount
        CHECK (amount > 0),

    -- Relationships
    CONSTRAINT fk_voucher_employee
        FOREIGN KEY (created_by)
        REFERENCES users(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT fk_voucher_director
        FOREIGN KEY (approved_by)
        REFERENCES users(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    -- Search and dashboard indexes
    INDEX idx_voucher_creator (created_by),
    INDEX idx_voucher_status (status),
    INDEX idx_voucher_department (department),
    INDEX idx_voucher_category (expense_category),
    INDEX idx_voucher_date (voucher_date),
    INDEX idx_voucher_created_at (created_at),
    INDEX idx_voucher_approved_by (approved_by)
);
