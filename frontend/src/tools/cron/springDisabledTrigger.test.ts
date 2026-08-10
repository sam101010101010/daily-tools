import { expect, test, vi } from 'vitest';

const { cronConstructor } = vi.hoisted(() => ({
  cronConstructor: vi.fn(function CronMock() {
    throw new Error('Spring disabled triggers must not construct Croner evaluators');
  }),
}));

vi.mock('croner', () => ({ Cron: cronConstructor }));

import { explainCron } from './cronExplain';
import { previewCron } from './cronPreview';
import { parseCron } from './profileSyntax';

test('Spring disabled sentinel short-circuits parsing, explanation, and preview (catches removal of the disabled-trigger branch)', () => {
  const parsed = parseCron('spring', '-');

  expect(parsed).toEqual({
    ok: true,
    value: { profile: 'spring', normalized: '-', disabled: true },
  });
  if (!parsed.ok) throw new Error('Expected Spring disabled trigger to parse');

  expect(explainCron(parsed.value)).toEqual({
    profile: 'spring',
    lines: ['Spring 的 @Scheduled 触发器已禁用，不会执行。'],
  });
  expect(previewCron(parsed.value, 'UTC', new Date('2024-01-01T00:00:00.000Z'))).toEqual({
    ok: false,
    profile: 'spring',
    code: 'disabled',
    error: 'Spring 的 @Scheduled 触发器已禁用，无法预览未来运行时间',
  });
  expect(cronConstructor).not.toHaveBeenCalled();
});

test.each([
  ['linux-vixie', 'field-count'],
  ['macos-bsd', 'field-count'],
  ['kubernetes', 'field-count'],
  ['quartz', 'field-count'],
  ['eventbridge-scheduler', 'unsupported'],
  ['eventbridge-legacy', 'unsupported'],
] as const)('%s rejects the Spring disabled sentinel (catches cross-profile sentinel acceptance)', (profile, code) => {
  expect(parseCron(profile, '-')).toMatchObject({
    ok: false,
    error: { profile, field: 'expression', code },
  });
});
