import { expect, test, vi } from 'vitest';
import { previewCron } from './cronPreview';
import { parseCron } from './profileSyntax';
import type { CronProfileId } from './profiles';

type SafetyVector = Readonly<{
  profile: CronProfileId;
  expression: string;
  unavailableError?: string;
}>;

const REPRESENTATIVE_EXPRESSIONS: readonly SafetyVector[] = [
  { profile: 'linux-vixie', expression: '0 9 * * MON-FRI' },
  { profile: 'macos-bsd', expression: '0 9 * * 1-5' },
  { profile: 'kubernetes', expression: '0 9 ? * MON-FRI' },
  { profile: 'spring', expression: '0 0 9 ? * MON-FRI' },
  { profile: 'quartz', expression: '0 0 9 ? * MON-FRI' },
  { profile: 'eventbridge-scheduler', expression: 'cron(0 9 ? * MON-FRI 2024)' },
  { profile: 'eventbridge-legacy', expression: 'cron(0 9 ? * MON-FRI 2024)' },
  { profile: 'spring', expression: '0 0 9 L-3 * ?', unavailableError: '该 Cron 方言的 L-n 日期偏移暂不能精确预览' },
  { profile: 'quartz', expression: '0 0 9 L-3 * ?', unavailableError: '该 Cron 方言的 L-n 日期偏移暂不能精确预览' },
  { profile: 'spring', expression: '0 0 9 ? * L', unavailableError: '该 Cron 方言的星期 L 值暂不能精确预览' },
  { profile: 'quartz', expression: '0 0 9 ? * L', unavailableError: '该 Cron 方言的星期 L 值暂不能精确预览' },
  { profile: 'eventbridge-scheduler', expression: 'cron(0 9 ? * L 2024)', unavailableError: '该 Cron 方言的星期 L 值暂不能精确预览' },
  { profile: 'eventbridge-legacy', expression: 'cron(0 9 ? * L 2024)', unavailableError: '该 Cron 方言的星期 L 值暂不能精确预览' },
];

test('all profile adapters construct paused evaluators without scheduling timers or executing work', () => {
  vi.useFakeTimers();
  try {
    for (const { profile, expression, unavailableError } of REPRESENTATIVE_EXPRESSIONS) {
      const parsed = parseCron(profile, expression);
      expect(parsed).toMatchObject({ ok: true, value: { profile } });
      if (!parsed.ok) throw new Error(`Expected ${profile} expression to parse`);

      const preview = previewCron(parsed.value, 'UTC', new Date('2024-01-01T00:00:00.000Z'));
      if (unavailableError) {
        expect(preview).toEqual({ ok: false, profile, error: unavailableError });
      } else {
        expect(preview).toMatchObject({ ok: true, profile });
      }
      expect(vi.getTimerCount()).toBe(0);
    }

    vi.advanceTimersByTime(365 * 24 * 60 * 60 * 1000);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
