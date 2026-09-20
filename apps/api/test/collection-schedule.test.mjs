import { describe, expect, it } from 'vitest';
import { nextScheduledInstant, scheduledInstantForDate } from '../dist/collection-schedule.js';

describe('다음 현지 수집 instant 계산', () => {
  it('일반 날짜와 timezone 날짜 경계에서 현재보다 뒤의 발생을 선택한다', () => {
    expect(nextScheduledInstant(new Date('2026-09-19T12:00:00.000Z'), { timezone: 'Asia/Seoul', time: '22:00' }).toISOString())
      .toBe('2026-09-19T13:00:00.000Z');
    expect(nextScheduledInstant(new Date('2026-09-19T13:00:00.000Z'), { timezone: 'Asia/Seoul', time: '22:00' }).toISOString())
      .toBe('2026-09-20T13:00:00.000Z');
    expect(nextScheduledInstant(new Date('2026-09-19T10:30:00.000Z'), { timezone: 'Pacific/Kiritimati', time: '00:15' }).toISOString())
      .toBe('2026-09-20T10:15:00.000Z');
  });

  it('DST gap은 뒤의 첫 유효 instant, overlap은 첫 instant를 선택한다', () => {
    expect(scheduledInstantForDate({ year: 2026, month: 3, day: 8 }, '02:30', 'America/New_York')?.toISOString())
      .toBe('2026-03-08T07:00:00.000Z');
    expect(scheduledInstantForDate({ year: 2026, month: 11, day: 1 }, '01:30', 'America/New_York')?.toISOString())
      .toBe('2026-11-01T05:30:00.000Z');
  });

  it('각 실행 뒤 다음 현지 날짜를 다시 계산해 하루 한 번만 반환한다', () => {
    const first = nextScheduledInstant(new Date('2026-11-01T04:00:00.000Z'), { timezone: 'America/New_York', time: '01:30' });
    const second = nextScheduledInstant(first, { timezone: 'America/New_York', time: '01:30' });
    expect(first.toISOString()).toBe('2026-11-01T05:30:00.000Z');
    expect(second.toISOString()).toBe('2026-11-02T06:30:00.000Z');
  });
});
