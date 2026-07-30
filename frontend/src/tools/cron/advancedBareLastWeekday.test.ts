import { expect, test, vi } from 'vitest';

const { cronConstructor } = vi.hoisted(() => ({
  cronConstructor: vi.fn(function CronMock() {
    throw new Error('Croner must not validate bare DOW L');
  }),
}));

vi.mock('croner', () => ({ Cron: cronConstructor }));

import { parseCron } from './profileSyntax';

test('parses native bare advanced DOW L without a Croner substitute but still validates dL with Croner', () => {
  const bareLastWeekday = parseCron('spring', '0 0 9 ? * L');

  expect(bareLastWeekday).toMatchObject({
    ok: true,
    value: { profile: 'spring', normalized: '0 0 9 ? * L', fieldValues: ['0', '0', '9', '?', '*', 'L'] },
  });
  expect(cronConstructor).not.toHaveBeenCalled();

  expect(parseCron('spring', '0 0 9 ? * 2L')).toMatchObject({
    ok: false,
    error: { profile: 'spring', field: 'expression', code: 'semantic' },
  });
  expect(cronConstructor).toHaveBeenCalledTimes(1);
});
