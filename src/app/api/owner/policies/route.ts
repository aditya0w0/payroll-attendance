import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";

const policySchema = z.object({
  name: z.string().min(2),
  mode: z.enum(["PER_MINUTE", "PER_HOUR"]),
  rate: z.number().int().positive(),
  hourlyRounding: z.enum(["EXACT", "ROUND_UP", "ROUND_DOWN", "ROUND_NEAREST"]).default("EXACT"),
  gracePeriodMinutes: z.number().int().min(0).default(10),
  maxDeductionPercent: z.number().int().min(1).max(100).default(100),
});

export async function GET() {
  const current = await getCurrentUser();
  if (!current || current.user.role !== "OWNER") {
    return NextResponse.json({ error: "Owner authorization required" }, { status: 403 });
  }

  const policies = await prisma.deductionPolicy.findMany({
    include: {
      _count: {
        select: { shifts: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ policies });
}

export async function POST(req: NextRequest) {
  const current = await getCurrentUser();
  if (!current || current.user.role !== "OWNER") {
    return NextResponse.json({ error: "Owner authorization required" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const result = policySchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ error: "Validation error", details: result.error.flatten() }, { status: 400 });
    }

    const newPolicy = await prisma.deductionPolicy.create({
      data: result.data,
    });

    await recordAuditLog({
      actorId: current.user.id,
      actorRole: "OWNER",
      actorName: current.user.username,
      action: "DEDUCTION_POLICY_CREATED",
      targetEntity: "DEDUCTION_POLICY",
      targetId: newPolicy.id,
      newValues: result.data,
      reason: "Owner configured new attendance deduction policy",
    });

    return NextResponse.json({ success: true, policy: newPolicy });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to create policy" }, { status: 500 });
  }
}
