# 🛡️ CyberGuard Zero-Trust Payroll & Single-Device Attendance System

An enterprise-grade, zero-trust web application for attendance tracking, late penalty salary deductions, single-device anti-bypass locking, and cryptographic audit trails.

---

## 🌟 Key Features

### 1. 💵 Monthly Salary & Daily Rate Management
- **Owner Configuration**: Set base monthly salary and standard monthly working days (default 22 days).
- **Automated Daily Rate**: Dynamically calculates the daily earning rate:
  $$\text{Daily Rate} = \frac{\text{Monthly Base Salary}}{\text{Standard Working Days}}$$
- **Live Modifications**: Owner can update salaries anytime, with automatic diff recording and audit logging.

### 2. ⏰ Late Punch Daily Salary Deductions
- **Shift & Grace Period**: Configurable start time (e.g. `09:00`) and grace window (e.g. `10 minutes`).
- **Automated Deduction**: When an employee clocks in past the grace period, their daily salary is deducted in real-time.
- **Configurable Deduction Rules**:
  - `FULL_DAILY`: 100% of daily salary forfeited for late arrival.
  - `HALF_DAILY`: 50% of daily salary deducted.
  - `PERCENTAGE`: Custom percentage penalty.
  - `PRO_RATED_HOURLY`: Pro-rated hourly penalty based on late minutes.
  - `TIERED`: Graduated penalties based on lateness severity.
- **Real-Time Warning**: Employee portal warns workers before punch-in if they are late and specifies the deduction amount.

### 3. 🔒 Zero-Trust Cryptographic Audit Ledger
- **Immutable SHA-256 Merkle Chain**: Every mutation (salary adjustments, attendance records, device binds/resets, login blocks, unlock code generations) is cryptographically chained using SHA-256.
- **Mathematical Integrity Verification**: Built-in verification engine scans from the genesis block to present, confirming zero unauthorized database tampering.
- **Comprehensive Diffs**: Displays exact before/after state diffs, timestamps, IP addresses, user agents, and cryptographic hashes.

### 4. 📱 Single-Device Anti-Bypass & Owner Unlock Code
- **Single-Device Policy**: Employee accounts are strictly bound to one physical device token/fingerprint on first login to eliminate buddy-punching and remote punch exploits.
- **Rogue Device Lockout**: Any attempt to log in from a secondary browser, incognito window, or new phone triggers an immediate **HTTP 423 Locked** security lockout.
- **Challenge & Unlock Workflow**:
  1. Blocked employee receives a unique **Request ID** (e.g., `REQ-7821`).
  2. Owner views the pending unlock challenge in the Owner Dashboard and generates/reveals a **6-digit One-Time Unlock Code** (valid for 30 minutes).
  3. Employee inputs the 6-digit code on the new device.
  4. System verifies the code, revokes the previous device, re-binds the new device, and logs the full cryptographic trace.
  5. Owner can also reset device bindings directly with one click from the employee management panel.

---

## 🚀 Quickstart & Access

The server runs on **Python 3 Standard Library** with zero external pip dependencies required.

### Accessing the Web Application
Open your web browser and navigate to:
👉 **[http://localhost:8000](http://localhost:8000)**

### Pre-Configured Demo Credentials

| Role | Email | Password | Pre-Bound Device Status |
| :--- | :--- | :--- | :--- |
| **Owner / HR Admin** | `owner@company.com` | `admin123` | Multi-terminal administrative authority |
| **Senior Dev** | `alice@company.com` | `employee123` | Bound to Authorized MacBook Pro |
| **Operations Lead** | `bob@company.com` | `employee123` | Unbound (auto-binds on first login) |
| **Support Lead** | `charlie@company.com` | `employee123` | Bound to Authorized iPhone 15 Pro |

*(Use the **Quick Demo Buttons** on the login page to switch between accounts with a single click!)*

---

## 🧪 Testing the Core Scenarios

### Scenario A: Testing Late Clock-In Deduction
1. Click **"👩 Alice (Authorized Mac)"** on the login screen.
2. Under the punch buttons, click **"Test Late Punch (09:28, Deducts Pay)"**.
3. Click **"Clock In Now"**.
4. Observe the banner: **"⚠️ Late Punch! Daily Salary Deduction Applied: -$160.00"**.
5. Switch to the **Owner** account: Navigate to **"Monthly Payroll & Late Deductions"** to see Alice's late penalty itemized in the payroll statement!

### Scenario B: Testing Single-Device Lockout & Owner Unlock Code
1. On the login screen, click **"⚠️ Alice (Simulate Rogue Device)"** (simulates an unauthorized device).
2. Click **"Authenticate & Proceed"**.
3. **Lockout Triggered**: Red security modal appears with **Request ID (e.g., `REQ-XXXX`)**.
4. Log into the **Owner** account (`owner@company.com` / `admin123`).
5. Open the **"Device Unlock Requests"** tab.
6. Note the **6-digit Unlock Code** (or click **"Direct Approve"**).
7. Return to Alice's screen, enter the 6-digit code, and click **"Verify & Bind Device"**. Alice is instantly unlocked and authorized!

### Scenario C: Testing Zero-Trust Tamper Detection
1. In the Owner Dashboard, navigate to **"🛡️ Zero Trust Audit Logs"**.
2. Click **"🔍 Run Cryptographic Verification Now"**.
3. The modal displays cryptographic confirmation: **"All N historical records mathematically validate against SHA-256 Merkle links. Zero tampering detected."**

---

## 📂 Project Architecture

```
Payroll attendance/
├── server.py              # ThreadingHTTPServer with REST API & Static routing
├── database.py            # SQLite schema, WAL mode, PBKDF2 hashing, seed data
├── zero_trust.py          # Cryptographic SHA-256 Merkle chain engine & integrity verifier
├── auth.py                # Session management, single-device check & unlock code verification
├── payroll.py             # Daily salary rate calculation, late deduction formulas & payroll summaries
├── test_direct.py         # Automated in-process integration test suite
├── static/
│   ├── index.html         # Single Page Web App (Glassmorphic dark/light enterprise UI)
│   ├── app.js             # Client state, device fingerprinting, punch dial, modals
│   └── style.css          # Modern enterprise stylesheet with responsive layout
└── README.md              # Complete system guide
```
