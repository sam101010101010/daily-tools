import { describe, expect, it } from 'vitest';

import { runTabularWorkerJob } from './csv.worker';
import type { TabularWorkerMessage } from './csv.worker';

function run(input: string): TabularWorkerMessage[] {
  const messages: TabularWorkerMessage[] = [];
  runTabularWorkerJob(
    {
      type: 'start',
      jobId: 'csv-job-7',
      request: {
        mode: 'csv-to-json',
        input,
        delimiter: ',',
        header: true,
        spreadsheetSafe: false,
      },
    },
    (message) => messages.push(message),
  );
  return messages;
}

describe('CSV Worker adapter', () => {
  it('maps a completed conversion to one serializable result for its job', () => {
    const messages = run('id,name\n001,Ada\n');

    expect(messages).toEqual([
      {
        type: 'result',
        jobId: 'csv-job-7',
        result: {
          kind: 'success',
          headers: ['id', 'name'],
          rows: [['001', 'Ada']],
          output: '[\n  {\n    "id": "001",\n    "name": "Ada"\n  }\n]\n',
          rowCount: 1,
          columnCount: 2,
          warnings: [],
        },
      },
    ]);
    expect(() => structuredClone(messages[0])).not.toThrow();
  });

  it('contains malformed start requests behind a stable engine failure', () => {
    const messages: TabularWorkerMessage[] = [];

    runTabularWorkerJob(
      { type: 'start', jobId: 'csv-job-malformed', request: { input: 7 } } as never,
      (message) => messages.push(message),
    );

    expect(messages).toEqual([
      { type: 'error', jobId: 'csv-job-malformed', code: 'TABULAR_ENGINE_FAILED' },
    ]);
  });
});
