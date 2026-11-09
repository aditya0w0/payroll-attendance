import { NextRequest, NextResponse } from "next/server";
import { flushAuditOutbox } from "@/lib/audit-outbox";

/**
 * Vercel Serverless Cron Handler
 * Securely triggered by Vercel Cron via CRON_SECRET bearer token.
 * Flushes pending outbox records to external tamper-evident WORM sink.
 */
export async function GET(req: NextRequest) {
  return handleFlush(req);
}

export async function POST(req: NextRequest) {
  return handleFlush(req);
}

async function handleFlush(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { error: "Unauthorized cron invocation" },
      { status: 401 }
    );
  }

  try {
    const result = await flushAuditOutbox(50);
    return NextResponse.json({
      success: result.status !== "FAILED",
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to flush audit outbox",
      },
      { status: 500 }
    );
  }
}
