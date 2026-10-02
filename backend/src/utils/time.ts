/** Offset (ms) of `timeZone` from UTC at the given instant, e.g. +19_800_000 for Asia/Kolkata. */
export function tzOffsetMs(date: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** The instant local midnight starts in `timeZone`, `daysAgo` days before the day containing `now`. */
export function startOfDayInTz(now: Date, timeZone: string, daysAgo = 0): Date {
  const offset = tzOffsetMs(now, timeZone);
  const local = new Date(now.getTime() + offset);
  local.setUTCHours(0, 0, 0, 0);
  local.setUTCDate(local.getUTCDate() - daysAgo);
  // Re-resolve the offset at the target day (handles DST changes between then and now).
  const guess = new Date(local.getTime() - offset);
  return new Date(local.getTime() - tzOffsetMs(guess, timeZone));
}

/** YYYY-MM-DD of the instant in `timeZone`. */
export function isoDateInTz(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function weekdayInTz(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date);
}
