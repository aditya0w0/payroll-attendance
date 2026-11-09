import { handleAttendanceScan } from "@/lib/attendance-scan-handler";

export async function POST(req: Request) {
  return await handleAttendanceScan(req);
}
