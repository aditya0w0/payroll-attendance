import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";

const configSchema = z.object({
  officeName: z.string().min(1, "Office name is required"),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusMeters: z.number().min(5).max(5000).default(50),
  officePublicIp: z.string().nullable().optional(),
  enforceWifiIp: z.boolean().default(false),
  enforceGeofence: z.boolean().default(true),
  maxGpsAccuracy: z.number().min(5).max(1000).default(80),
});

export async function GET(req: Request) {
  const current = await getCurrentUser(req);
  if (!current || current.user.role !== "OWNER") {
    return NextResponse.json({ error: "Owner authorization required" }, { status: 403 });
  }

  let config = await prisma.officeConfig.findFirst({
    orderBy: { createdAt: "desc" },
  });

  if (!config) {
    config = await prisma.officeConfig.create({
      data: {
        officeName: "Kantor Utama",
        latitude: -6.2088,
        longitude: 106.8456,
        radiusMeters: 50,
        officePublicIp: "127.0.0.1",
        enforceWifiIp: false,
        enforceGeofence: true,
        maxGpsAccuracy: 80,
      },
    });
  }

  return NextResponse.json({ config });
}

export async function POST(req: Request) {
  const current = await getCurrentUser(req);
  if (!current || current.user.role !== "OWNER") {
    return NextResponse.json({ error: "Owner authorization required" }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = configSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const {
      officeName,
      latitude,
      longitude,
      radiusMeters,
      officePublicIp,
      enforceWifiIp,
      enforceGeofence,
      maxGpsAccuracy,
    } = parsed.data;

    const previousConfig = await prisma.officeConfig.findFirst({
      orderBy: { createdAt: "desc" },
    });

    const updatedConfig = await prisma.officeConfig.create({
      data: {
        officeName: officeName.trim(),
        latitude,
        longitude,
        radiusMeters,
        officePublicIp: officePublicIp ? officePublicIp.trim() : null,
        enforceWifiIp,
        enforceGeofence,
        maxGpsAccuracy,
      },
    });

    const ip = (
      req.headers.get("x-forwarded-for")?.split(",")[0] ||
      req.headers.get("x-real-ip") ||
      "127.0.0.1"
    ).trim();

    await recordAuditLog({
      actorId: current.user.id,
      actorRole: "OWNER",
      actorName: current.user.username,
      action: "OFFICE_CONFIG_UPDATED",
      targetEntity: "OFFICE_SETTINGS",
      targetId: updatedConfig.id,
      previousValues: previousConfig
        ? {
            officeName: previousConfig.officeName,
            latitude: previousConfig.latitude,
            longitude: previousConfig.longitude,
            radiusMeters: previousConfig.radiusMeters,
            officePublicIp: previousConfig.officePublicIp,
            enforceWifiIp: previousConfig.enforceWifiIp,
            enforceGeofence: previousConfig.enforceGeofence,
            maxGpsAccuracy: previousConfig.maxGpsAccuracy,
          }
        : null,
      newValues: {
        officeName: updatedConfig.officeName,
        latitude: updatedConfig.latitude,
        longitude: updatedConfig.longitude,
        radiusMeters: updatedConfig.radiusMeters,
        officePublicIp: updatedConfig.officePublicIp,
        enforceWifiIp: updatedConfig.enforceWifiIp,
        enforceGeofence: updatedConfig.enforceGeofence,
        maxGpsAccuracy: updatedConfig.maxGpsAccuracy,
      },
      ipAddress: ip,
      reason: "Owner updated office physical coordinates and WiFi verification policy",
    });

    return NextResponse.json({
      success: true,
      message: "Konfigurasi lokasi kantor dan WiFi berhasil disimpan.",
      config: updatedConfig,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to update office configuration" },
      { status: 500 }
    );
  }
}
