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

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const current = await getCurrentUser(req);
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
  const current = await getCurrentUser(req);
  if (!current || current.user.role !== "OWNER") {
    return NextResponse.json({ error: "Owner authorization required" }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
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
    console.error("Create policy error:", error);
    return NextResponse.json({ error: "Failed to create policy" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const current = await getCurrentUser(req);
  if (!current || current.user.role !== "OWNER") {
    return NextResponse.json({ error: "Owner authorization required" }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || !body.id) {
      return NextResponse.json({ error: "Policy ID is required" }, { status: 400 });
    }

    const { id, ...dataToValidate } = body;
    const result = policySchema.safeParse(dataToValidate);

    if (!result.success) {
      return NextResponse.json({ error: "Validation error", details: result.error.flatten() }, { status: 400 });
    }

    const previous = await prisma.deductionPolicy.findUnique({ where: { id } });
    if (!previous) {
      return NextResponse.json({ error: "Policy not found" }, { status: 404 });
    }

    const updated = await prisma.deductionPolicy.update({
      where: { id },
      data: result.data,
    });

    await recordAuditLog({
      actorId: current.user.id,
      actorRole: "OWNER",
      actorName: current.user.username,
      action: "DEDUCTION_POLICY_UPDATED",
      targetEntity: "DEDUCTION_POLICY",
      targetId: id,
      previousValues: previous,
      newValues: result.data,
      reason: "Owner updated attendance deduction policy",
    });

    return NextResponse.json({ success: true, policy: updated });
  } catch (error: any) {
    console.error("Update policy error:", error);
    return NextResponse.json({ error: "Failed to update policy" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const current = await getCurrentUser(req);
  if (!current || current.user.role !== "OWNER") {
    return NextResponse.json({ error: "Owner authorization required" }, { status: 403 });
  }

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Policy ID is required" }, { status: 400 });
    }

    const policy = await prisma.deductionPolicy.findUnique({
      where: { id },
      include: {
        _count: { select: { shifts: true } },
      },
    });

    if (!policy) {
      return NextResponse.json({ error: "Policy not found" }, { status: 404 });
    }

    if (policy._count.shifts > 0) {
      return NextResponse.json(
        { error: `Tidak dapat menghapus kebijakan yang masih digunakan oleh ${policy._count.shifts} shift aktif` },
        { status: 400 }
      );
    }

    await prisma.deductionPolicy.delete({ where: { id } });

    await recordAuditLog({
      actorId: current.user.id,
      actorRole: "OWNER",
      actorName: current.user.username,
      action: "DEDUCTION_POLICY_DELETED",
      targetEntity: "DEDUCTION_POLICY",
      targetId: id,
      previousValues: policy,
      reason: "Owner deleted attendance deduction policy",
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Delete policy error:", error);
    return NextResponse.json({ error: "Failed to delete policy" }, { status: 500 });
  }
}
