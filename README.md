# Payroll & QR Attendance System

A web application for daily employee attendance tracking and automated wage calculation. The system uses rotating QR codes displayed on office terminals, GPS radius checks on mobile punch-in, single-device binding, and configurable late deduction policies.

---

## Architecture & Workflows

### 1. QR Attendance Verification

```mermaid
flowchart TD
    subgraph Kiosk["Office Display Terminal"]
        T1["Generate Challenge Token (15s TTL)"] --> T2["Display Dynamic QR Code"]
        T2 -.->|"Rotates every 15s or after punch"| T1
    end

    subgraph Mobile["Employee Mobile Browser"]
        C1["Camera Scanner"] --> C2["Read QR Token Payload"]
        C3["GPS Coordinate Check"] --> C4["Capture Location and Network IP"]
        C2 --> C5["Sign Attendance Request"]
        C4 --> C5
        C5 --> C6["Submit Punch Request"]
    end

    subgraph Server["Server Validation"]
        C6 --> S1{"Valid Token?"}
        S1 --"Expired or Invalid"--> E1["Reject Punch Request"]
        S1 --"Valid"--> S2{"Token Already Used?"}
        S2 --"Yes"--> E2["Reject Replay Attempt"]
        S2 --"No"--> S3{"Device Match?"}
        S3 --"Unregistered Device"--> E3["Lock Session (HTTP 423)"]
        S3 --"Authorized Device"--> S4{"Within Geofence?"}
        S4 --"Out of Bounds"--> E4["Reject: Outside Radius"]
        S4 --"In Bounds"--> S5["Process Attendance Record"]
    end

    subgraph Database["Database Commit"]
        S5 --> P1["Invalidate Used Token"]
        S5 --> P2["Determine Punch Direction (Check-In or Check-Out)"]
        S5 --> P3["Calculate Late Minutes and Wage Deductions"]
        S5 --> P4["Write Record to Audit Log"]
    end
```

---

### 2. Device Binding and Replacement

```mermaid
flowchart LR
    A["Employee Login"] --> B{"Hardware Fingerprint Match?"}
    B --"Recognized Device"--> C["Issue Session Cookie"]
    B --"New Device"--> D{"Passkey Registered?"}
    D --"Yes"--> E["Biometric Passkey Challenge"]
    E --> F{"Passkey Verified?"}
    F --"Verified"--> G["Update Device Binding and Authenticate"]
    F --"Failed"--> H["Lock Session (HTTP 423)"]
    D --"No"--> H
    H --> I["Generate Unlock Request Code"]
    I --> J{"Owner Approval"}
    J --"Owner Approves in Dashboard"--> K["Revoke Old Sessions and Bind New Device"]
    J --"Owner Shares 6-Digit Code"--> L["Employee Enters Code within 5m"]
    L --> K
```

---

### 3. Daily Wage Calculation and Late Deductions

```mermaid
flowchart TD
    W1["Check-In Timestamp"] --> W2{"Arrival Time vs Scheduled Shift"}
    W2 --"Within Grace Period"--> W3["On-Time Arrival"]
    W3 --> W4["Late Deduction = Rp0"]
    W2 --"Past Grace Period"--> W5["Calculate Late Minutes"]
    W5 --> W6{"Deduction Policy"}
    W6 --"Per-Minute"--> W7["Deduction = Late Minutes x Rate Per Minute"]
    W6 --"Hourly (Round Up)"--> W8["Deduction = Ceil(Late Minutes / 60) x Hourly Rate"]
    W6 --"Hourly (Round Down)"--> W9["Deduction = Floor(Late Minutes / 60) x Hourly Rate"]
    W6 --"Hourly (Exact)"--> W10["Deduction = (Late Minutes / 60) x Hourly Rate"]
    W7 --> W11["Apply Daily Wage Cap: Min(Deduction, Daily Salary)"]
    W8 --> W11
    W9 --> W11
    W10 --> W11
    W4 --> W12["Net Wage = Daily Salary - Late Deduction"]
    W11 --> W12
    W12 --> W13["Save Attendance and Payslip Snapshot"]
```

---

## Features

### 1. Integer IDR Wage Engine
- Wages are stored and calculated as integer Indonesian Rupiah (IDR) values per completed shift (e.g., Rp150.000 / day).
- Calculations avoid floating-point math to prevent decimal rounding differences.
- Salary rate adjustments are recorded with effective dates and author identity.

### 2. Rotating QR Terminal
- The office display generates a QR challenge token that rotates every 15 seconds.
- Tokens are invalidated immediately upon a successful scan to prevent photo sharing or proxy attendance.
- The terminal checks token status every 1.5 seconds and refreshes immediately when a token is consumed.
- The system determines automatically whether the scan is a check-in or check-out based on the employee's active shift status.

### 3. Device Binding & Passkey Recovery
- Each employee account is bound to a single physical device profile upon first sign-in.
- Access attempts from unrecognized hardware result in an account lock with an unlock request ID.
- Employees with registered WebAuthn passkeys can self-authenticate after clearing browser storage.
- Owners can unlock accounts directly from the management dashboard or generate a 5-minute single-use 6-digit code.
- Approving a new device revokes existing sessions on previous hardware.

### 4. Geolocation and Office Network Verification
- Verifies employee GPS coordinates against the configured office location and maximum allowable radius.
- Rejects coarse cellular tower estimates (over 80 meters) until stable satellite coordinates are obtained.
- Supports office Wi-Fi public IP verification for indoor environments where satellite signals are weak.

### 5. Multi-Shift and Overnight Support
- Supports morning shifts, evening shifts, and overnight shifts that cross midnight (e.g., 22:00 to 06:00).
- Overnight shifts are linked to their scheduled start date, preventing next-day check-outs from creating duplicate attendance records.

### 6. Activity and Audit Log
- System actions (clock-ins, corrections, device unlock approvals, salary changes, and period closures) are written to an append-only audit log table.
- Log entries are chained with SHA-256 hashes for data integrity.

---

## Technology Stack

| Component | Technology |
| :--- | :--- |
| Application Framework | Next.js 14 (App Router, Server Actions, Route Handlers) |
| Language | TypeScript (Strict Mode) |
| Styling | Tailwind CSS |
| Database ORM | Prisma ORM 5 |
| Database | PostgreSQL (Supabase Pooler) with SQLite local development support |
| Authentication | Device Fingerprint, FIDO2 / WebAuthn Passkeys |
| Cryptography | SHA-256 Digesting, Ed25519 Signatures |
| QR Code Generation | qrcode (Canvas / Data URL) |
| QR Code Decoding | jsQR |
| Data Visualization | Recharts |
| Icons | Lucide React |

---

## Project Structure

```
.
|-- prisma/
|   |-- schema.prisma             # Data models and database relations
|   `-- seed.ts                   # Development seed data and default shifts
|-- src/
|   |-- app/
|   |   |-- layout.tsx            # Root layout and theme providers
|   |   |-- globals.css           # Global styles and design tokens
|   |   |-- login/                # Authentication page (Owner / Employee)
|   |   |-- owner/                # Management console
|   |   |   |-- page.tsx          # Real-time attendance summary
|   |   |   |-- attendance/       # Attendance logs and manual corrections
|   |   |   |-- audit-logs/       # System activity trail
|   |   |   |-- devices/          # Device authorizations and unlock requests
|   |   |   |-- employees/        # Employee directory and wage settings
|   |   |   |-- payroll/          # Wage reports and payslip generation
|   |   |   |-- qr/               # Office QR terminal display
|   |   |   |-- settings/         # Geofence coordinates and office network IP
|   |   |   `-- shifts/           # Shift schedules and deduction policies
|   |   |-- employee/             # Employee portal
|   |   |   |-- page.tsx          # Current shift status and payslip summary
|   |   |   |-- scan/             # QR scanner with camera and GPS check
|   |   |   `-- history/          # Attendance history and wage breakdowns
|   |   `-- api/                  # API route handlers
|   |       |-- auth/             # Login, session, and WebAuthn endpoints
|   |       |-- employee/         # Mobile attendance verification
|   |       |-- geo/              # Geolocation and IP validation
|   |       |-- owner/            # Management and analytics endpoints
|   |       `-- qr/               # QR challenge generation and validation
|   `-- lib/
|       |-- audit.ts              # Append-only activity logger
|       |-- auth.ts               # Session verification and role guards
|       |-- db.ts                 # Prisma client instance
|       |-- device-client.ts      # Device fingerprinting and Web Crypto helpers
|       |-- payroll.ts            # Wage and lateness deduction calculations
|       |-- qr.ts                 # QR token generator and validator
|       |-- rp-resolver.ts        # WebAuthn Relying Party resolver
|       |-- timezone.ts           # Asia/Jakarta time and overnight shift helpers
|       `-- utils.ts              # Deterministic IDR currency formatting
|-- scripts/
|   |-- test-runner.js            # General functional test suite
|   |-- test-token-ttl.js         # QR token expiration tests
|   |-- audit-enterprise-verification.js # Session, device, and payroll tests
|   |-- qa-security-suite.js      # Concurrency and role permission tests
|   |-- test-hardened-architecture.ts    # WebAuthn and device recovery tests
|   |-- test-anti-cheat-geofence.ts      # Geofencing validation tests
|   `-- test-analytics-aggregation.ts    # Attendance KPI and trend tests
`-- README.md
```

---

## Getting Started

### Prerequisites
- Node.js 20.x or higher
- npm 10.x or higher

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/aditya0w0/payroll-attendance.git
   cd payroll-attendance
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables in `.env`:
   ```env
   DATABASE_URL="file:./dev.db"
   JWT_SECRET="your-session-secret"
   CRON_SECRET="your-scheduled-job-token"
   AUDIT_SIGNING_PRIVATE_KEY="your-ed25519-private-key"
   AUDIT_SIGNING_PUBLIC_KEY="your-ed25519-public-key"
   ```

4. Initialize the database and load seed data:
   ```bash
   npx prisma db push
   npx prisma db seed
   ```

5. Start the development server:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Default Accounts (Seed Data)

| Role | Identifier | Password | Shift / Rate |
| :--- | :--- | :--- | :--- |
| Owner | `owner@company.com` | `admin123` | Administrator |
| Employee (Budi Santoso) | `budi@company.com` | `employee123` | Shift Pagi (Rp150.000 / day) |
| Employee (Siti Rahma) | `siti@company.com` | `employee123` | Shift Malam (Rp175.000 / day) |
| Employee (Ahmad Fauzi) | `ahmad@company.com` | `employee123` | Shift Sore (Rp140.000 / day) |

---

## Automated Tests

The repository includes automated test scripts verifying wage calculation, token rotation, geofencing, and shift handling.

Run all tests:
```bash
npm run test:all
```

Key test scripts:
- `scripts/test-runner.js`: Wage calculation rules and historical rates.
- `scripts/test-token-ttl.js`: 15-second token expiration and single-use burn verification.
- `scripts/test-anti-cheat-geofence.ts`: Geographic distance checks and coordinate validation.
- `scripts/qa-security-suite.js`: Concurrent attendance punches and role guards.
- `scripts/test-hardened-architecture.ts`: Device binding and passkey recovery.
- `scripts/test-analytics-aggregation.ts`: Daily attendance trends and aggregation calculations.

---

## Production Build

```bash
# Build production bundle
npm run build

# Start production server
npm start
```

---

## License

This project is licensed under the MIT License.
