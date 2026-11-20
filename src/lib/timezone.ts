/**
 * Authoritative Timezone & Shift Scheduling Utilities (Asia/Jakarta)
 */

export const BUSINESS_TIMEZONE = "Asia/Jakarta";
const JAKARTA_OFFSET_HOURS = 7; // UTC+7

/**
 * Gets current date/time in Asia/Jakarta as a standard Date object.
 */
export function getJakartaNow(): Date {
  return new Date();
}

/**
 * Returns current date string formatted as "YYYY-MM-DD" in Asia/Jakarta timezone.
 */
export function getJakartaDateString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date); // outputs "YYYY-MM-DD"
}

/**
 * Returns current time string formatted as "HH:mm" in Asia/Jakarta timezone.
 */
export function getJakartaTimeString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: BUSINESS_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return formatter.format(date); // outputs "HH:mm"
}

/**
 * Returns a human-friendly formatted date/time string in Asia/Jakarta.
 */
export function formatJakartaDateTime(date: Date | string | null | undefined): string {
  if (!date) return "--";
  const d = typeof date === "string" ? new Date(date) : date;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: BUSINESS_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const p: Record<string, string> = {};
  for (const part of parts) {
    p[part.type] = part.value;
  }
  return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute}:${p.second}`;
}

/**
 * Returns time string formatted as "HH:mm:ss" or "HH:mm" in Asia/Jakarta.
 */
export function formatJakartaTime(date: Date | string | null | undefined, includeSeconds: boolean = true): string {
  if (!date) return "--";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: BUSINESS_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: includeSeconds ? "2-digit" : undefined,
    hour12: false,
  }).format(d);
}

/**
 * Constructs authoritative scheduled start and end timestamps for a shift given a shiftDate ("YYYY-MM-DD").
 * Handles overnight shifts (e.g. 22:00 to 06:00 next day) properly.
 */
export function computeShiftTimestamps(
  shiftDateStr: string, // "YYYY-MM-DD"
  startTimeStr: string, // "08:00" or "22:00"
  endTimeStr: string,   // "17:00" or "06:00"
  isOvernight: boolean
): { scheduledStart: Date; scheduledEnd: Date } {
  // Parse year, month, day
  const [year, month, day] = shiftDateStr.split("-").map(Number);
  const [startHour, startMin] = startTimeStr.split(":").map(Number);
  const [endHour, endMin] = endTimeStr.split(":").map(Number);

  // Construct start date in UTC representing Jakarta time (Jakarta is UTC+7)
  // Jakarta time = UTC + 7 hours => UTC = Jakarta time - 7 hours
  const startUtc = new Date(Date.UTC(year, month - 1, day, startHour - JAKARTA_OFFSET_HOURS, startMin, 0));

  let endDay = day;
  if (isOvernight) {
    endDay = day + 1;
  }
  const endUtc = new Date(Date.UTC(year, month - 1, endDay, endHour - JAKARTA_OFFSET_HOURS, endMin, 0));

  return {
    scheduledStart: startUtc,
    scheduledEnd: endUtc,
  };
}

/**
 * Determines the authoritative shiftDate for an active check-in or check-out attempt.
 * For overnight shifts (e.g. 22:00 - 06:00):
 * If check-in occurs between 20:00 and 23:59, the shiftDate is today.
 * If employee check-in or check-out happens early morning (e.g. 05:30), the shiftDate belongs to yesterday!
 */
export function determineActiveShiftDate(
  now: Date,
  startTimeStr: string,
  endTimeStr: string,
  isOvernight: boolean
): string {
  const jakartaDate = getJakartaDateString(now);
  const jakartaTime = getJakartaTimeString(now);

  if (!isOvernight) {
    return jakartaDate;
  }

  // Overnight shift logic:
  // e.g. Start 22:00, End 06:00
  // If current time is early morning (e.g. < 12:00), this check-out or late check-in belongs to previous calendar day's shift instance!
  const [startH] = startTimeStr.split(":").map(Number);
  const [currentH] = jakartaTime.split(":").map(Number);

  if (currentH < startH && currentH <= 12) {
    // Belongs to yesterday's shift!
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return getJakartaDateString(yesterday);
  }

  return jakartaDate;
}
