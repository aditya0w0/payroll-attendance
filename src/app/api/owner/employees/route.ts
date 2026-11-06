import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";

const createEmployeeSchema = z.object({
  fullName: z.string().min(2, "Full name must be at least 2 characters"),
  employeeId: z.string().min(2, "Employee ID is required"),
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Valid email is required"),
  initialPassword: z.string().min(6, "Password must be at least 6 characters"),
  dailySalary: z.number().int().positive("Daily salary must be a positive integer in IDR"),
  shiftId: z.string().min(1, "Shift must be selected"),
  employmentStatus: z.enum(["PERMANENT", "CONTRACT", "PROBATION"]).default("PERMANENT"),
});

export async function GET() {
  const current = await getCurrentUser();
  if (!current || current.user.role !== "OWNER") {
    return NextResponse.json({ error: "Owner authorization required" }, { status: 403 });
  }

  const employees = await prisma.employeeProfile.findMany({
    include: {
      user: {
        select: {
          id: true,
          email: true,
          username: true,
          status: true,
          createdAt: true,
          deviceRegistration: true,
        },
      },
      shift: {
        include: {
          deductionPolicy: true,
        },
      },
      salaryHistory: {
        orderBy: { effectiveDate: "desc" },
        take: 5,
      },
    },
    orderBy: { fullName: "asc" },
  });

  return NextResponse.json({ employees });
}

export async function POST(req: NextRequest) {
  const current = await getCurrentUser();
  if (!current || current.user.role !== "OWNER") {
    return NextResponse.json({ error: "Owner authorization required" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const result = createEmployeeSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Validation error", details: result.error.flatten() },
        { status: 400 }
      );
    }

    const {
      fullName,
      employeeId,
      username,
      email,
      initialPassword,
      dailySalary,
      shiftId,
      employmentStatus,
    } = result.data;

    // Check existing email or username or employeeId
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { email: email.toLowerCase() },
          { username: username.toLowerCase() },
          { employeeProfile: { employeeId } },
        ],
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "An employee with this email, username, or Employee ID already exists." },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(initialPassword, 10);

    const newEmployee = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: email.toLowerCase(),
          username: username.toLowerCase(),
          passwordHash,
          role: "EMPLOYEE",
          status: "ACTIVE",
          employeeProfile: {
            create: {
              fullName,
              employeeId,
              dailySalary,
              shiftId,
              employmentStatus,
            },
          },
        },
        include: { employeeProfile: true },
      });

      // Record baseline salary history
      if (user.employeeProfile) {
        await tx.employeeSalaryHistory.create({
          data: {
            employeeId: user.employeeProfile.id,
            previousSalary: 0,
            newSalary: dailySalary,
            reason: "Initial onboarding salary",
            changedByUserId: current.user.id,
          },
        });
      }

      return user;
    });

    // Zero-Trust Audit Log
    await recordAuditLog({
      actorId: current.user.id,
      actorRole: "OWNER",
      actorName: current.user.username,
      action: "EMPLOYEE_CREATED",
      targetEntity: "EMPLOYEE",
      targetId: newEmployee.employeeProfile?.id,
      newValues: {
        fullName,
        employeeId,
        username,
        email,
        dailySalary,
        shiftId,
        employmentStatus,
      },
      reason: "Owner registered new employee profile",
    });

    return NextResponse.json({
      success: true,
      message: `Employee ${fullName} created successfully!`,
      employee: newEmployee.employeeProfile,
    });
  } catch (error: any) {
    console.error("Create employee error:", error);
    return NextResponse.json({ error: error.message || "Failed to create employee" }, { status: 500 });
  }
}
