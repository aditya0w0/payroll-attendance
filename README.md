# 🛡️ CyberGuard — Zero-Trust Payroll & Dynamic QR Attendance System

A modern, production-ready attendance and daily payroll application built with **Next.js 14 (App Router)**, **TypeScript**, **Tailwind CSS**, and **Prisma ORM**.

Designed following **Apple's Human Interface Guidelines (HIG)**: minimalist, clean, responsive, and mobile-first for employees.

---

## 🌟 Core Concepts & Product Philosophy

The product remains intentionally simple:
$$\text{Owner configures employees, daily salaries, and shifts} \longrightarrow \text{Employee scans dynamic QR to check in} \longrightarrow \text{Works} \longrightarrow \text{Scans QR to check out} \longrightarrow \text{Immediately sees transparent daily payslip}$$

### 1. 💵 Primary Wage Model: Daily Salary
- Primary wage is configured as a **daily salary in integer Indonesian Rupiah (IDR)** (e.g. `Rp 150.000` / completed scheduled day).
- Changing an employee's salary records an audit log and preserves historical values and effective dates in `EmployeeSalaryHistory`.

### 2. ⏰ Configurable Lateness Deduction Engine
- Formula:
  $$\text{Late Minutes} = \max(0, \text{Actual Check-in} - \text{Scheduled Start} - \text{Grace Period})$$
  $$\text{Late Deduction} = \text{Late Minutes} \times \text{Configured Deduction Rate}$$
  $$\text{Net Daily Earnings} = \max(0, \text{Daily Salary} - \text{Late Deduction})$$
- **Mode A — Per Minute**: Owner sets rate per minute (e.g. Rp500/min). 12 minutes late past grace = Rp6,000 deduction.
- **Mode B — Per Hour**: Owner sets rate per hour (e.g. Rp10,000/hr) with configurable rounding:
  - Exact proportional
  - Round up to next full hour (`ceil`)
  - Round down to full hour (`floor`)
  - Round to nearest hour (`round`)
- Maximum deduction is capped at applicable daily salary.

### 3. 📷 Dynamic Workplace QR Attendance
- Workplace terminal displays a server-generated QR challenge token that rotates every **15 seconds** (`expiresAt = now + 15s`).
- **Anti-Replay**: Multiple employees can scan the same active 15s challenge token, but the same employee cannot scan the same challenge twice.
- **Server State Machine**: Automatically detects whether an employee is **Checking In (Absen Masuk)** or **Checking Out (Absen Pulang)**.
- **Instant Transparency**: Immediately after checking out, the employee sees their full daily payslip breakdown.

### 4. 🌙 Flexible Shift & Overnight Logic
- Supports Daytime, Evening, and **Overnight Shifts** (e.g., `22:00` to `06:00` the next day).
- Overnight shifts are treated as **ONE attendance session** tied to the scheduled shift instance and start date ($D$), so checking out on calendar day $D+1$ is never mistaken for a new attendance day.

### 5. 📱 Single-Device Policy & Owner Unlock Code
- Employee accounts are cryptographically bound to a single physical device/browser profile via Web Crypto on first login.
- Unregistered devices are immediately **blocked** with `HTTP 423 Locked`.
- Blocked employee receives a unique **Request ID** (e.g. `REQ-94218`).
- Owner can view the pending request, reveal a cryptographically random **6-digit One-Time Unlock Code** (valid for 5 minutes), or click **Direct Approve**.
- Owner can manually clear device registrations at any time.

### 6. 🔒 Zero-Trust Append-Only Audit Logging
- Every mutation (employee creation, salary changes, shift updates, check-ins, check-outs, manual corrections, device blocks, unlock approvals, payroll finalizations) is recorded in an immutable append-only `AuditLog` table.
- Accessible via the Owner's dedicated Audit Trail inspector with search, filters, and before/after JSON diffs.

---

## 🚀 Live Access & Quickstart

The application is built and running live at:
👉 **[http://localhost:3000](http://localhost:3000)**

### Pre-Configured Demo Accounts

| Role | Username / Email | Password | Pre-Bound Device |
| :--- | :--- | :--- | :--- |
| **Owner / Admin** | `owner@company.com` | `admin123` | Multi-terminal administrative authority |
| **Budi Santoso** | `budi@company.com` | `employee123` | Bound to Authorized MacBook Pro (Rp150,000/day) |
| **Siti Rahma** | `siti@company.com` | `employee123` | Unbound (auto-binds upon first login, Rp175,000/day) |
| **Ahmad Fauzi** | `ahmad@company.com` | `employee123` | Bound to Pixel 8 (Evening shift, Rp140,000/day) |

*(The login page features **1-click Fast Demo Pre-load buttons** to switch roles instantly)*

---

## 🧪 Testing Acceptance Criteria in 3 Minutes

### Test 1: Transparent Check-In & Check-Out
1. Log in as **Budi** (`budi@company.com` / `employee123`) using the **"👨 Budi (Auth Mac)"** demo button.
2. Click **"Scan QR to Check In"** and tap **"1-Tap Scan Workplace QR Code"**.
3. Check-in is recorded.
4. Tap **"Scan QR to Check Out"** and tap **"1-Tap Scan Workplace QR Code"**.
5. You immediately see the **Daily Attendance Payslip** with Base Daily Salary, Scheduled Check-in, Actual Check-in, Late Duration, Late Deduction, and Net Daily Earnings!

### Test 2: Single-Device Anti-Bypass Lockout & Owner Unlock Code
1. On the login screen, click **"⚠️ Budi (Rogue Device)"**.
2. Click **"Sign In"**.
3. **Lockout Triggered**: Red security modal appears:
   > **Device Not Authorized**
   > Request ID: `REQ-XXXXX`
4. Open the **Owner Console** (`owner@company.com` / `admin123`) and navigate to **"Device Security"**.
5. Locate the pending request with `REQ-XXXXX` and copy the **6-digit Unlock Code** (or click **Direct Approve**).
6. Return to Budi's screen, enter the 6-digit code, and click **"Verify & Bind"** to immediately re-bind and sign in!

### Test 3: Payroll Finalization & Historical Snapshot Protection
1. In the Owner Console, open **"Payroll"**.
2. Review aggregated completed days, daily salaries, total late minutes, and net earnings.
3. Click **"Finalize & Lock Period"** to create an immutable snapshot.

---

## 📂 Project Architecture

```
Payroll attendance/
├── prisma/
│   ├── schema.prisma       # SQLite/PostgreSQL schema with 14 normalized models
│   └── seed.ts             # Demo seed data (Owner, shifts, policies, employees)
├── src/
│   ├── app/
│   │   ├── page.tsx        # Minimalist landing page
│   │   ├── login/page.tsx  # Sign In with Single-Device Web Crypto check & lockout modal
│   │   ├── owner/          # Owner Console (Overview, Employees, Shifts, Attendance, Payroll, Devices, Audit Logs, QR)
│   │   ├── employee/       # Mobile-first Employee Portal (Dashboard, Scan QR, History)
│   │   └── api/            # Server-side REST endpoints (auth, qr, owner, employee)
│   ├── lib/
│   │   ├── db.ts           # Prisma ORM singleton
│   │   ├── auth.ts         # Session cookie & Single-device enforcement
│   │   ├── timezone.ts     # Authoritative Asia/Jakarta time & overnight shift logic
│   │   ├── payroll.ts      # Integer IDR daily wage & lateness deduction engine
│   │   ├── qr.ts           # Rotating 15-second dynamic QR generator & validator
│   │   ├── audit.ts        # Zero-Trust immutable append-only audit logger
│   │   ├── device-client.ts# Web Crypto client keypair & hardware fingerprint
│   │   └── utils.ts        # Indonesian Rupiah (IDR) currency formatting
├── scripts/
│   └── test-runner.js      # Automated 7-suite acceptance criteria test runner
└── README.md
```
