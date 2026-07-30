import { expect, test, vi } from 'vitest';
import { previewCron } from './cronPreview';
import { parseCron } from './profileSyntax';
import type { CronProfileId } from './profiles';

const REPRESENTATIVE_EXPRESSIONS: readonly Readonly<{ profile: CronProfileId; expression: string }>[] = [
  { profile: 'linux-vixie', expression: '0 9 * * MON-FRI' },
  { profile: 'macos-bsd', expression: '0 9 * * 1-5' },
  { profile: 'kubernetes', expression: '0 9 ? * MON-FRI' },
  { profile: 'spring', expression: '0 0 9 ? * MON-FRI' },
  { profile: 'quartz', expression: '0 0 9 ? * MON-FRI' },
  { profile: 'eventbridge-scheduler', expression: 'cron(0 9 ? * MON-FRI 2024)' },
  { profile: 'eventbridge-legacy', expression: 'cron(0 9 ? * MON-FRI 2024)' },
];

test('all profile adapters construct paused evaluators without scheduling timers or executing work', () => {
  vi.useFakeTimers();
  try {
    for (const { profile, expression } of REPRESENTATIVE_EXPRESSIONS) {
      const parsed = parseCron(profile, expression);
      expect(parsed).toMatchObject({ ok: true, value: { profile } });
      if (!parsed.ok) throw new Error(`Expected ${profile} expression to parse`);

      const preview = previewCron(parsed.value, 'UTC', new Date('2024-01-01T00:00:00.000Z'));
      expect(preview).toMatchObject({ ok: true, profile });
      expect(vi.getTimerCount()).toBe(0);
    }

    vi.advanceTimersByTime(365 * 24 * 60 * 60 * 1000);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
