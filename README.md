# Expense Voucher Management System

An internship-assignment workflow for creating, signing, reviewing, and
tracking expense vouchers. Employees create drafts and submit signed vouchers,
Directors approve or reject them, and Accounts can search and view the
organization register without mutation access.

## Technology

- React, React Router, Vite, Tailwind CSS
- Node.js, Express 5, JWT, bcryptjs, Multer
- MySQL 8+
- Node's built-in test runner and Supertest

## Requirements

- Node.js 20 or newer
- MySQL 8 or newer
- PowerShell on Windows

## Project structure

```text
client/       React/Vite frontend
server/       Express API, authentication, uploads, and tests
database/     MySQL schema
```

## Windows installation

From the repository root:

```powershell
cd C:\path\to\expense-voucher-management
cd server
npm install
Copy-Item .env.example .env
notepad .env
```

Set local database credentials and a private JWT secret in `server\.env`.
Never commit that file.

For the frontend environment, only change the default when the API is hosted
at another URL:

```powershell
cd ..\client
npm install
Copy-Item .env.example .env
```

## Environment variables

### Server

`server\.env.example` documents:

```text
PORT
CLIENT_URL
DB_HOST
DB_PORT
DB_USER
DB_PASSWORD
DB_NAME
JWT_SECRET
JWT_EXPIRES_IN
```

### Client

`client\.env.example` contains:

```text
VITE_API_URL=http://localhost:5000/api
```

## Database setup

Create the schema with MySQL Workbench or the MySQL client:

```powershell
cd C:\path\to\expense-voucher-management
mysql -u root -p < database\schema.sql
```

The schema creates `expense_voucher_db`, `users`, and `vouchers`.

## Demo accounts

The safe seeder creates synthetic Employee, Director, and Accounts users,
never deletes records, and skips an account that already exists. New passwords
are generated with a cryptographically secure random source and printed only
to the local terminal:

```powershell
cd C:\path\to\expense-voucher-management\server
node src\seedDemoUsers.js
```

Save the printed credentials locally. They are deliberately not stored in
source code, `.env.example`, or Git.

For one manually selected local account, use `src\createUser.js` with
PowerShell environment variables as described below. Use a password of at
least 12 characters:

```powershell
$env:BOOTSTRAP_NAME = "Test Employee"
$env:BOOTSTRAP_EMAIL = "employee.test@example.com"
$env:BOOTSTRAP_PASSWORD = "EmployeeTest123!"
$env:BOOTSTRAP_ROLE = "EMPLOYEE"
$env:BOOTSTRAP_DEPARTMENT = "Engineering"
node src\createUser.js
Remove-Item Env:BOOTSTRAP_NAME,Env:BOOTSTRAP_EMAIL,Env:BOOTSTRAP_PASSWORD,Env:BOOTSTRAP_ROLE,Env:BOOTSTRAP_DEPARTMENT
```

Use `DIRECTOR` or `ACCOUNTS` for the other roles. Do not use real credentials
in this command or commit them.

## Run the application

Open two PowerShell windows.

Backend:

```powershell
cd C:\path\to\expense-voucher-management\server
npm run dev
```

Frontend:

```powershell
cd C:\path\to\expense-voucher-management\client
npm run dev
```

Open the URL printed by Vite, normally
`http://localhost:5173`. The API health endpoint is
`http://localhost:5000/api/health`.

## Roles and workflow

```text
DRAFT -> PENDING_APPROVAL -> APPROVED
                         \-> REJECTED
```

Submission is recorded with `submitted_at` and immediately enters the Director
approval queue; a separate `SUBMITTED` database state is not needed for this
workflow.

### Employee

- Create and edit own drafts
- Upload an employee signature
- Submit signed drafts
- View only own vouchers
- View rejection reasons and status

### Director

- View organization vouchers
- Search, filter, sort, and paginate
- Approve with a Director signature
- Reject with a required reason

### Accounts

- View organization vouchers and protected signatures
- Search, filter, sort, and paginate
- Read-only access; no create, edit, delete, submit, approve, or reject routes

Approved and rejected vouchers are read-only.

## API

Except for health and login, requests require:

```text
Authorization: Bearer <jwt>
```

| Method | Route | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/api/health` | Public | Health check |
| POST | `/api/auth/login` | Public | Login with JSON email/password |
| GET | `/api/auth/me` | Authenticated | Verify the current JWT/user |
| GET | `/api/vouchers` | Authenticated | List permitted vouchers |
| GET | `/api/vouchers/:id` | Authenticated | View one permitted voucher |
| GET | `/api/vouchers/:id/signatures/:kind` | Authenticated | Protected employee/director signature |
| POST | `/api/vouchers` | Employee | Create multipart draft |
| PUT | `/api/vouchers/:id` | Employee | Edit an own draft |
| DELETE | `/api/vouchers/:id` | Employee | Delete an own draft |
| POST | `/api/vouchers/:id/submit` | Employee | Submit a signed draft |
| POST | `/api/vouchers/:id/approve` | Director | Approve with `directorSignature` |
| POST | `/api/vouchers/:id/reject` | Director | Reject with `rejectionReason` |

`GET /api/vouchers` supports `search`, `status`, `department`, `category`,
`from`, `to`, `minAmount`, `maxAmount`, `page`, `pageSize`, `sort`, and
`direction`. Sort columns are selected from a server-side whitelist and query
values are parameterized.

## Validation and security

- Passwords are stored as bcrypt hashes.
- JWTs are verified on protected routes and on frontend startup through
  `/api/auth/me`.
- Role middleware and voucher ownership checks protect mutations and details.
- Employee signatures are required before submission.
- Director signatures are required before approval.
- Rejection reasons are required.
- Uploads validate size, MIME type, extension, and image content.
- Upload names are generated server-side.
- Signature files are not publicly served.
- `.env`, uploads, logs, dependencies, and build output are ignored by Git.

## Testing

Frontend build and lint:

```powershell
cd C:\path\to\expense-voucher-management\client
npm run build
npm run lint
```

Backend tests:

```powershell
cd C:\path\to\expense-voucher-management\server
npm test
```

The backend test suite uses a separate `${DB_NAME}_test` database (or
`TEST_DB_NAME`) and removes only that test database after completion. It covers
login, JWT failures, role authorization, ownership, draft restrictions,
signatures, workflow transitions, protected files, sorting, and pagination.

## Limitations

- Signature storage is local disk storage for the assignment demo.
- Voucher download/print is optional in the assignment and is not implemented.
- Accounts is intentionally read-only.
- Browser testing requires a running MySQL instance and seeded local accounts.

## Submission checklist

1. Clone the repository.
2. Run `npm install` in `server` and `client`.
3. Copy `.env.example` files and configure local values.
4. Run `database\schema.sql`.
5. Run `node src\seedDemoUsers.js` from `server`.
6. Start backend and frontend in separate terminals.
7. Open the Vite URL and test all three roles.
8. Run `npm test`, `npm run build`, and `npm run lint`.

Do not commit `.env` files, generated uploads, passwords, JWT secrets, or
personal data.
