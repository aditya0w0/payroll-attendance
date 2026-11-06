import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";

const updateSchema = z.object({
  fullName: z.string().optional(),
  dailySalary: z.number().int().positive().optional(),
  shiftId: z.string().optional(),
  employmentStatus: z.enum(["PERMANENT", "CONTRACT", "PROBATION"]).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).optional(),
  salaryChangeReason: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const current = await getCurrentUser();
  if (!current || current.user.role !== "OWNER") {
    return NextResponse.json({ error: "Owner authorization required" }, { status: 403 });
  }

  try {
    const employeeProfileId = params.id;
    const body = await req.json();
    const result = updateSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ error: "Validation error", details: result.error.flatten() }, { status: 400 });
    }

    const currentProfile = await prisma.employeeProfile.findUnique({
      where: { id: employeeProfileId },
      include: { user: true, shift: true },
    });

    if (!currentProfile) {
      return NextResponse.json({ error: "Employee profile not found" }, { status: 404 });
    }

    const { fullName, dailySalary, shiftId, employmentStatus, status, salaryChangeReason } = result.data;
    const previousValues = {
      fullName: currentProfile.fullName,
      dailySalary: currentProfile.dailySalary,
      shiftId: currentProfile.shiftId,
      employmentStatus: currentProfile.employmentStatus,
      status: currentProfile.user.status,
    };

    const isSalaryChanged = dailySalary !== undefined && dailySalary !== currentProfile.dailySalary;

    await prisma.$transaction(async (tx) => {
      // 1. Update Profile
      await tx.employeeProfile.update({
        where: { id: employeeProfileId },
        data: {
          fullName: fullName ?? undefined,
          dailySalary: dailySalary ?? undefined,
          shiftId: shiftId ?? undefined,
          employmentStatus: employmentStatus ?? undefined,
        },
      });

      // 2. Update user status if provided
      if (status) {
        await tx.user.update({
          where: { id: currentProfile.userId },
          data: { status },
        });
      }

      // 3. If salary changed, record historical snapshot!
      if (isSalaryChanged) {
        await tx.employeeSalaryHistory.create({
          data: {
            employeeId: employeeProfileId,
            previousSalary: currentProfile.dailySalary,
            newSalary: dailySalary!,
            effectiveDate: new Date(),
            reason: salaryChangeReason || "Owner compensation revision",
            changedByUserId: current.user.id,
          },
        });
      }
    });

    // 4. Record Zero-Trust Audit Log
    const action = isSalaryChanged ? "EMPLOYEE_SALARY_CHANGED" : "EMPLOYEE_PROFILE_UPDATED";
    await recordAuditLog({
      actorId: current.user.id,
      actorRole: "OWNER",
      actorName: current.user.username,
      action,
      targetEntity: "EMPLOYEE",
      targetId: employeeProfileId,
      previousValues,
      newValues: {
        fullName: fullName ?? currentProfile.fullName,
        dailySalary: dailySalary ?? currentProfile.dailySalary,
        shiftId: shiftId ?? currentProfile.shiftId,
        employmentStatus: employmentStatus ?? currentProfile.employmentStatus,
        status: status ?? currentProfile.user.status,
        reason: salaryChangeReason,
      },
      reason: salaryChangeReason || "Owner updated employee record",
    });

    return NextResponse.json({
      success: true,
      message: `Employee ${currentProfile.fullName} updated successfully.`,
    });
  } catch (error: any) {
    console.error("Update employee error:", error);
    return NextResponse.json({ error: error.message || "Failed to update employee" }, { status: 500 });
  }
}

export const PUT = PATCH;
