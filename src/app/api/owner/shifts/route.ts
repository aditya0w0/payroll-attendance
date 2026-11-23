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

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const current = await getCurrentUser(req);
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
  const current = await getCurrentUser(req);
  if (!current || current.user.role !== "OWNER") {
    return NextResponse.json({ error: "Owner authorization required" }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
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
    console.error("Create shift error:", error);
    return NextResponse.json({ error: "Failed to create shift" }, { status: 500 });
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
      return NextResponse.json({ error: "Shift ID is required" }, { status: 400 });
    }

    const { id, ...dataToValidate } = body;
    const result = shiftSchema.safeParse(dataToValidate);

    if (!result.success) {
      return NextResponse.json({ error: "Validation error", details: result.error.flatten() }, { status: 400 });
    }

    const previous = await prisma.shift.findUnique({ where: { id } });
    if (!previous) {
      return NextResponse.json({ error: "Shift not found" }, { status: 404 });
    }

    const updated = await prisma.shift.update({
      where: { id },
      data: result.data,
      include: { deductionPolicy: true },
    });

    await recordAuditLog({
      actorId: current.user.id,
      actorRole: "OWNER",
      actorName: current.user.username,
      action: "SHIFT_UPDATED",
      targetEntity: "SHIFT",
      targetId: id,
      previousValues: previous,
      newValues: result.data,
      reason: "Owner updated work shift schedule",
    });

    return NextResponse.json({ success: true, shift: updated });
  } catch (error: any) {
    console.error("Update shift error:", error);
    return NextResponse.json({ error: "Failed to update shift" }, { status: 500 });
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
      return NextResponse.json({ error: "Shift ID is required" }, { status: 400 });
    }

    const shift = await prisma.shift.findUnique({
      where: { id },
      include: {
        _count: { select: { employees: true } },
      },
    });

    if (!shift) {
      return NextResponse.json({ error: "Shift not found" }, { status: 404 });
    }

    if (shift._count.employees > 0) {
      return NextResponse.json(
        { error: `Tidak dapat menghapus shift yang masih memiliki ${shift._count.employees} karyawan aktif` },
        { status: 400 }
      );
    }

    await prisma.shift.delete({ where: { id } });

    await recordAuditLog({
      actorId: current.user.id,
      actorRole: "OWNER",
      actorName: current.user.username,
      action: "SHIFT_DELETED",
      targetEntity: "SHIFT",
      targetId: id,
      previousValues: shift,
      reason: "Owner deleted work shift schedule",
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Delete shift error:", error);
    return NextResponse.json({ error: "Failed to delete shift" }, { status: 500 });
  }
}
