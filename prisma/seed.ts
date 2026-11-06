import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database for Payroll & QR Attendance...");

  // 1. Owner account
  const ownerPasswordHash = await bcrypt.hash("admin123", 10);
  const owner = await prisma.user.upsert({
    where: { email: "owner@company.com" },
    update: {},
    create: {
      email: "owner@company.com",
      username: "owner",
      passwordHash: ownerPasswordHash,
      role: "OWNER",
      status: "ACTIVE",
    },
  });
  console.log(`✓ Owner created: ${owner.email} (Password: admin123)`);

  // 2. Deduction Policies
  const policyPerMin = await prisma.deductionPolicy.create({
    data: {
      name: "Per Minute Standard (Rp500/min, 10m Grace)",
      mode: "PER_MINUTE",
      rate: 500, // Rp500 / minute
      hourlyRounding: "EXACT",
      gracePeriodMinutes: 10,
      maxDeductionPercent: 100,
    },
  });

  const policyHourly = await prisma.deductionPolicy.create({
    data: {
      name: "Hourly Deduction (Rp10,000/hr, Round Up, 15m Grace)",
      mode: "PER_HOUR",
      rate: 10000, // Rp10,000 / hour
      hourlyRounding: "ROUND_UP",
      gracePeriodMinutes: 15,
      maxDeductionPercent: 100,
    },
  });
  console.log("✓ Deduction policies created");

  // 3. Work Shifts (Daytime, Evening, Overnight)
  const shiftMorning = await prisma.shift.create({
    data: {
      name: "Morning Shift (08:00 - 17:00)",
      startTime: "08:00",
      endTime: "17:00",
      isOvernight: false,
      gracePeriodMinutes: 10,
      applicableDays: "1,2,3,4,5",
      deductionPolicyId: policyPerMin.id,
    },
  });

  const shiftEvening = await prisma.shift.create({
    data: {
      name: "Evening Shift (16:00 - 00:00)",
      startTime: "16:00",
      endTime: "00:00",
      isOvernight: true,
      gracePeriodMinutes: 10,
      applicableDays: "1,2,3,4,5",
      deductionPolicyId: policyPerMin.id,
    },
  });

  const shiftOvernight = await prisma.shift.create({
    data: {
      name: "Overnight Shift (22:00 - 06:00)",
      startTime: "22:00",
      endTime: "06:00",
      isOvernight: true,
      gracePeriodMinutes: 15,
      applicableDays: "1,2,3,4,5,6",
      deductionPolicyId: policyHourly.id,
    },
  });
  console.log("✓ Work shifts created (Morning, Evening, Overnight)");

  // 4. Employees
  const empPasswordHash = await bcrypt.hash("employee123", 10);

  // Employee 1: Budi Santoso (Morning Shift, Rp150,000/day, Bound Device)
  const userBudi = await prisma.user.create({
    data: {
      email: "budi@company.com",
      username: "budi",
      passwordHash: empPasswordHash,
      role: "EMPLOYEE",
      status: "ACTIVE",
      employeeProfile: {
        create: {
          employeeId: "EMP-001",
          fullName: "Budi Santoso",
          dailySalary: 150000, // Rp150,000
          shiftId: shiftMorning.id,
          employmentStatus: "PERMANENT",
        },
      },
      deviceRegistration: {
        create: {
          deviceFingerprint: "fp_budi_macbook_pro_auth",
          deviceName: "Budi's Authorized MacBook Pro",
          platform: "macOS Workstation",
          isActive: true,
        },
      },
    },
    include: { employeeProfile: true },
  });

  // Employee 2: Siti Rahma (Overnight Shift, Rp175,000/day, Unbound)
  const userSiti = await prisma.user.create({
    data: {
      email: "siti@company.com",
      username: "siti",
      passwordHash: empPasswordHash,
      role: "EMPLOYEE",
      status: "ACTIVE",
      employeeProfile: {
        create: {
          employeeId: "EMP-002",
          fullName: "Siti Rahma",
          dailySalary: 175000, // Rp175,000
          shiftId: shiftOvernight.id,
          employmentStatus: "PERMANENT",
        },
      },
    },
    include: { employeeProfile: true },
  });

  // Employee 3: Ahmad Fauzi (Evening Shift, Rp140,000/day, Bound to Phone)
  const userAhmad = await prisma.user.create({
    data: {
      email: "ahmad@company.com",
      username: "ahmad",
      passwordHash: empPasswordHash,
      role: "EMPLOYEE",
      status: "ACTIVE",
      employeeProfile: {
        create: {
          employeeId: "EMP-003",
          fullName: "Ahmad Fauzi",
          dailySalary: 140000, // Rp140,000
          shiftId: shiftEvening.id,
          employmentStatus: "CONTRACT",
        },
      },
      deviceRegistration: {
        create: {
          deviceFingerprint: "fp_ahmad_pixel_8_auth",
          deviceName: "Ahmad's Authorized Pixel 8",
          platform: "Android Phone",
          isActive: true,
        },
      },
    },
    include: { employeeProfile: true },
  });
  console.log("✓ Employees created: Budi, Siti, Ahmad (Password: employee123)");

  // 5. Initial Pending Device Unlock Request for demo
  await prisma.deviceUnlockRequest.create({
    data: {
      requestCode: "REQ-94218",
      unlockCode: "482915",
      userId: userBudi.id,
      requestedFingerprint: "fp_unauthorized_rogue_device_99",
      requestedDeviceName: "Suspicious Chrome on Windows 11",
      previousDeviceName: "Budi's Authorized MacBook Pro",
      status: "PENDING",
      ipAddress: "192.168.1.105",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
    },
  });

  // 6. Sample completed attendance record demonstrating exact payslip example:
  // Daily Salary: Rp150,000, Scheduled: 08:00, Actual: 08:12, Late: 12 mins, Deduction: Rp6,000, Net: Rp144,000
  if (userBudi.employeeProfile) {
    const pastCheckIn = new Date("2026-11-05T01:12:00.000Z"); // 08:12 Asia/Jakarta (UTC+7)
    const pastCheckOut = new Date("2026-11-05T10:05:00.000Z"); // 17:05 Asia/Jakarta
    const schedStart = new Date("2026-11-05T01:00:00.000Z"); // 08:00 Asia/Jakarta
    const schedEnd = new Date("2026-11-05T10:00:00.000Z"); // 17:00 Asia/Jakarta

    await prisma.attendanceRecord.create({
      data: {
        employeeId: userBudi.employeeProfile.id,
        shiftId: shiftMorning.id,
        shiftDate: "2026-11-05",
        checkInTime: pastCheckIn,
        checkOutTime: pastCheckOut,
        scheduledStartTime: schedStart,
        scheduledEndTime: schedEnd,
        status: "LATE_COMPLETED",
        lateMinutes: 12,
        dailySalarySnapshot: 150000,
        deductionPolicySnapshot: JSON.stringify({ mode: "PER_MINUTE", rate: 500 }),
        lateDeduction: 6000, // 12 mins * Rp500 = Rp6,000
        netDailyEarnings: 144000, // Rp150,000 - Rp6,000 = Rp144,000
        checkInDeviceFingerprint: "fp_budi_macbook_pro_auth",
        checkOutDeviceFingerprint: "fp_budi_macbook_pro_auth",
      },
    });
  }

  // 7. Initial Zero-Trust Audit Logs
  await prisma.auditLog.createMany({
    data: [
      {
        actorRole: "OWNER",
        actorName: "System Owner",
        action: "SYSTEM_INITIALIZATION",
        targetEntity: "SYSTEM",
        targetId: "GENESIS",
        newValues: JSON.stringify({ system: "Payroll & QR Attendance", timezone: "Asia/Jakarta" }),
        ipAddress: "127.0.0.1",
        reason: "Initial system bootstrap with Zero-Trust configuration",
      },
      {
        actorRole: "OWNER",
        actorName: "System Owner",
        action: "EMPLOYEE_CREATED",
        targetEntity: "EMPLOYEE",
        targetId: userBudi.id,
        newValues: JSON.stringify({
          fullName: "Budi Santoso",
          dailySalary: 150000,
          shift: "Morning Shift (08:00 - 17:00)",
        }),
        ipAddress: "127.0.0.1",
        reason: "New employee onboarding",
      },
      {
        actorRole: "SYSTEM",
        actorName: "Security Engine",
        action: "DEVICE_LOGIN_BLOCKED",
        targetEntity: "DEVICE_SECURITY",
        targetId: "REQ-94218",
        newValues: JSON.stringify({
          user: "Budi Santoso",
          blockedDevice: "Suspicious Chrome on Windows 11",
          reason: "Single-device policy violation. Unlock request generated.",
        }),
        ipAddress: "192.168.1.105",
      },
    ],
  });

  console.log("✅ Database successfully seeded with full initial data!");
}

main()
  .catch((e) => {
    console.error("Error during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
