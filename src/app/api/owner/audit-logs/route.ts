import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const current = await getCurrentUser(req);
  if (!current || current.user.role !== "OWNER") {
    return NextResponse.json({ error: "Owner authorization required" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");
  const targetEntity = searchParams.get("targetEntity");
  const query = searchParams.get("query");
  const rawLimit = parseInt(searchParams.get("limit") || "100", 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 500) : 100;

  const where: any = {};
  if (action === "CHEATING_ALERTS") {
    where.action = { startsWith: "CHEATING_ALERT_" };
  } else if (action) {
    where.action = action;
  }
  if (targetEntity) where.targetEntity = targetEntity;
  if (query) {
    where.OR = [
      { action: { contains: query } },
      { actorName: { contains: query } },
      { targetEntity: { contains: query } },
      { reason: { contains: query } },
      { newValues: { contains: query } },
    ];
  }

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { timestamp: "desc" },
    take: limit,
  });

  return NextResponse.json({ logs, total: logs.length });
}
