import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";

const shiftSchema = z.object({
  name: z.string().min(2),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Format must be HH:mm"),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Format must be HH:mm"),
  isOvernight: z.boolean().default(false),
  gracePeriodMinutes: z.number().int().min(0).default(10),
  applicableDays: z.string().default("1,2,3,4,5"),
  deductionPolicyId: z.string().min(1),
});

export async function GET() {
  const current = await getCurrentUser();
  if (!current || current.user.role !== "OWNER") {
    return NextResponse.json({ error: "Owner authorization required" }, { status: 403 });
  }

  const shifts = await prisma.shift.findMany({
    include: {
      deductionPolicy: true,
      _count: {
        select: { employees: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ shifts });
}

export async function POST(req: NextRequest) {
  const current = await getCurrentUser();
  if (!current || current.user.role !== "OWNER") {
    return NextResponse.json({ error: "Owner authorization required" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const result = shiftSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ error: "Validation error", details: result.error.flatten() }, { status: 400 });
    }

    const newShift = await prisma.shift.create({
      data: result.data,
      include: { deductionPolicy: true },
    });

    await recordAuditLog({
      actorId: current.user.id,
      actorRole: "OWNER",
      actorName: current.user.username,
      action: "SHIFT_CREATED",
      targetEntity: "SHIFT",
      targetId: newShift.id,
      newValues: result.data,
      reason: "Owner configured new work shift schedule",
    });

    return NextResponse.json({ success: true, shift: newShift });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to create shift" }, { status: 500 });
  }
}
