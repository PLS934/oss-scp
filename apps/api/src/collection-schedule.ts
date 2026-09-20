import type { CollectionSchedule } from '@oss-scp/plugin-config';

interface LocalDate { year: number; month: number; day: number }
interface LocalDateTime extends LocalDate { hour: number; minute: number }

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timezone: string): Intl.DateTimeFormat {
  let value = formatterCache.get(timezone);
  if (!value) {
    value = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      calendar: 'iso8601',
      numberingSystem: 'latn',
      hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
    formatterCache.set(timezone, value);
  }
  return value;
}

function localDateTime(instant: Date, timezone: string): LocalDateTime {
  const parts = Object.fromEntries(formatter(timezone).formatToParts(instant).map(part => [part.type, part.value]));
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute),
  };
}

function compareDate(left: LocalDate, right: LocalDate): number {
  return left.year - right.year || left.month - right.month || left.day - right.day;
}

function addDay(date: LocalDate): LocalDate {
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day + 1));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}

/** DST overlap에서는 첫 instant, gap에서는 요청 시각 뒤 첫 유효 minute를 반환한다. */
export function scheduledInstantForDate(date: LocalDate, time: string, timezone: string): Date | null {
  const [hour, minute] = time.split(':').map(Number) as [number, number];
  const requestedMinute = hour * 60 + minute;
  const base = Date.UTC(date.year, date.month - 1, date.day);
  const start = base - 18 * 60 * 60 * 1000;
  const end = base + 42 * 60 * 60 * 1000;
  for (let value = start; value <= end; value += 60_000) {
    const instant = new Date(value);
    const local = localDateTime(instant, timezone);
    const dateOrder = compareDate(local, date);
    if (dateOrder < 0) continue;
    if (dateOrder > 0) return null;
    const localMinute = local.hour * 60 + local.minute;
    if (localMinute >= requestedMinute) return instant;
  }
  return null;
}

export function nextScheduledInstant(now: Date, schedule: Pick<CollectionSchedule, 'timezone' | 'time'>): Date {
  const current = localDateTime(now, schedule.timezone);
  let date: LocalDate = { year: current.year, month: current.month, day: current.day };
  for (let attempts = 0; attempts < 8; attempts += 1) {
    const candidate = scheduledInstantForDate(date, schedule.time, schedule.timezone);
    if (candidate && candidate.getTime() > now.getTime()) return candidate;
    date = addDay(date);
  }
  throw new Error('다음 수집 일정을 계산할 수 없습니다.');
}
