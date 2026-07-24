import { describe, expect, it } from 'vitest';
import { runRegexWorkerJob } from './regexp.worker';
import type { RegexWorkerMessage, RegexWorkerStartMessage } from './regexp.worker';

const request = {
  pattern: '(?<word>\\w+)',
  flags: 'g',
  text: 'one two',
  replacement: '[$<word>]',
};

function run(overrides: Partial<RegexWorkerStartMessage['request']> = {}) {
  const messages: RegexWorkerMessage[] = [];
  runRegexWorkerJob(
    { type: 'start', jobId: 'job-7', request: { ...request, ...overrides } },
    (message) => messages.push(message),
  );
  return messages;
}

describe('regexp worker', () => {
  it('maps successful evaluation and replacement preview to a serializable result message', () => {
    const messages = run();

    expect(messages).toEqual([
      {
        type: 'result',
        jobId: 'job-7',
        evaluation: {
          kind: 'success',
          flags: 'g',
          matches: [
            { text: 'one', index: 0, captures: ['one'], namedCaptures: { word: 'one' } },
            { text: 'two', index: 4, captures: ['two'], namedCaptures: { word: 'two' } },
          ],
          truncated: false,
        },
        replacementPreview: { kind: 'preview', value: '[one] [two]' },
      },
    ]);
    expect(() => structuredClone(messages[0])).not.toThrow();
  });

  it('maps no-match evaluation and preview to the same job', () => {
    expect(run({ pattern: 'missing' })).toEqual([
      {
        type: 'result',
        jobId: 'job-7',
        evaluation: { kind: 'no-match', flags: 'g', matches: [], truncated: false },
        replacementPreview: { kind: 'no-match' },
      },
    ]);
  });

  it('maps the match limit without losing the job id', () => {
    const messages = run({ pattern: 'a', text: 'a'.repeat(501) });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      type: 'result',
      jobId: 'job-7',
      evaluation: { kind: 'limit-reached', truncated: true },
    });
  });

  it('maps syntax errors without exposing native error text', () => {
    expect(run({ pattern: '[' })).toEqual([
      {
        type: 'result',
        jobId: 'job-7',
        evaluation: { kind: 'syntax-error', error: '正则语法错误，请检查表达式。' },
        replacementPreview: { kind: 'syntax-error', error: '正则语法错误，请检查表达式。' },
      },
    ]);
  });

  it('does not create a replacement preview when the template is empty', () => {
    expect(run({ replacement: '' })[0]).not.toHaveProperty('replacementPreview');
  });

  it('maps unknown thrown errors to the approved retry message', () => {
    const brokenRequest = {
      ...request,
      get replacement(): string {
        throw new Error('sensitive internal detail');
      },
    };
    const messages: RegexWorkerMessage[] = [];

    runRegexWorkerJob({ type: 'start', jobId: 'broken', request: brokenRequest }, (message) =>
      messages.push(message),
    );

    expect(messages).toEqual([
      { type: 'error', jobId: 'broken', message: '正则执行失败，请重试。' },
    ]);
  });
});
