import { useState } from 'react';
import { ErrorView } from '../../components/ErrorView';
import { copyText } from '../../lib/copy';
import { explainCron } from './cronExplain';
import { previewCron, type CronRun } from './cronPreview';
import { parseFiveFieldCron, type CronSyntaxError } from './cronSyntax';

const DEFAULT_EXPRESSION = '*/15 9-17 * * MON-FRI';
const OR_EXPLANATION = '日期和星期均受限时，任一条件满足即可执行';
const PREVIEW_FAILURE = '无法生成预览，请检查五字段表达式与 IANA 时区。';

const FIELD_HINTS = [
  '分钟（0–59）',
  '小时（0–23）',
  '日期（1–31）',
  '月份（1–12 / JAN–DEC）',
  '星期（0–7 / SUN–SAT）',
] as const;

const FIELD_LABELS: Record<CronSyntaxError['field'], string> = {
  expression: '表达式',
  minute: '分钟',
  hour: '小时',
  dayOfMonth: '日期',
  month: '月份',
  dayOfWeek: '星期',
};

const FIELD_INDEX: Partial<Record<CronSyntaxError['field'], number>> = {
  minute: 0,
  hour: 1,
  dayOfMonth: 2,
  month: 3,
  dayOfWeek: 4,
};

type SuccessView = Readonly<{
  kind: 'success';
  normalized: string;
  explanation: readonly string[];
  runs: readonly CronRun[];
}>;

type ViewState =
  | SuccessView
  | Readonly<{ kind: 'error'; message: string }>
  | null;

export type CronToolProps = Readonly<{
  now?: () => Date;
}>;

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function supportedTimeZones(defaultTimeZone: string): string[] {
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return [...new Set([defaultTimeZone, 'UTC', ...zones])].sort();
}

function unsupportedFeature(input: string, field: CronSyntaxError['field']): string | undefined {
  const trimmed = input.trim();
  const normalized = trimmed.toUpperCase();
  if (normalized.startsWith('@')) return `${trimmed.split(/\s/, 1)[0]} 昵称`;
  if (/^\d{4}-\d{2}-\d{2}T/.test(normalized)) return 'ISO 时间';
  const fieldIndex = FIELD_INDEX[field];
  const fieldToken = fieldIndex === undefined ? '' : (trimmed.split(/\s+/)[fieldIndex] ?? '').toUpperCase();
  const symbol = ['#', '?', '+'].find(feature => fieldToken.includes(feature));
  if (symbol) return symbol;
  if ((field === 'dayOfMonth' || field === 'dayOfWeek') && fieldToken.includes('L')) return 'L';
  if (field === 'dayOfMonth' && fieldToken.includes('W')) return 'W';
  return undefined;
}

function syntaxErrorMessage(error: CronSyntaxError, input: string): string {
  const feature = unsupportedFeature(input, error.field);
  if (error.code === 'field-count') {
    if (feature) return `不支持 ${feature}。`;
    return '只支持五字段，不支持秒或年份字段。';
  }
  if (feature && error.field !== 'expression') {
    return `${FIELD_LABELS[error.field]}字段不支持 ${feature} 扩展语法。`;
  }
  return `${FIELD_LABELS[error.field]}字段：${error.message}。`;
}

function evaluate(expression: string, timeZone: string, now: Date): Exclude<ViewState, null> {
  try {
    const parsed = parseFiveFieldCron(expression);
    if (!parsed.ok) return { kind: 'error', message: syntaxErrorMessage(parsed.error, expression) };

    const preview = previewCron(parsed.value, timeZone, now);
    if (!preview.ok) return { kind: 'error', message: `时区：${preview.error}。` };

    return {
      kind: 'success',
      normalized: parsed.value.normalized,
      explanation: explainCron(parsed.value).lines,
      runs: preview.value.runs,
    };
  } catch {
    return { kind: 'error', message: PREVIEW_FAILURE };
  }
}

export default function CronTool({ now = () => new Date() }: CronToolProps) {
  const [expression, setExpression] = useState(DEFAULT_EXPRESSION);
  const [timeZone, setTimeZone] = useState(browserTimeZone);
  const [view, setView] = useState<ViewState>(() => evaluate(DEFAULT_EXPRESSION, timeZone, now()));
  const [copyStatus, setCopyStatus] = useState('');
  const zones = supportedTimeZones(timeZone);

  function invalidate(next: () => void) {
    next();
    setView(null);
    setCopyStatus('');
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCopyStatus('');
    setView(evaluate(expression, timeZone, now()));
  }

  async function copyValue(value: string, successMessage: string) {
    const result = await copyText(value);
    setCopyStatus(result.ok ? successMessage : result.message);
  }

  const orExplanation = view?.kind === 'success'
    ? view.explanation.find(line => line === OR_EXPLANATION)
    : undefined;

  return (
    <div className="cron">
      <header className="cron__intro">
        <span className="cron__badge">五字段 Cron</span>
        <p>仅解释和预览，不会执行任务、注册定时器或保存输入。</p>
      </header>

      <form className="cron__form" onSubmit={submit}>
        <label htmlFor="cron-expression">Cron 表达式</label>
        <div className="cron__expression-row">
          <input
            id="cron-expression"
            aria-label="Cron 表达式"
            autoComplete="off"
            spellCheck={false}
            value={expression}
            onChange={event => invalidate(() => setExpression(event.target.value))}
          />
          <button type="submit">生成预览</button>
        </div>

        <ol className="cron__field-legend" aria-label="字段顺序">
          {FIELD_HINTS.map(hint => <li key={hint}>{hint}</li>)}
        </ol>

        <label htmlFor="cron-time-zone">IANA 时区</label>
        <select
          id="cron-time-zone"
          aria-label="IANA 时区"
          value={timeZone}
          onChange={event => invalidate(() => setTimeZone(event.target.value))}
        >
          {zones.map(zone => <option key={zone} value={zone}>{zone}</option>)}
        </select>
      </form>

      {view?.kind === 'error' && <ErrorView message={view.message} />}

      {view?.kind === 'success' && (
        <div className="cron__results">
          <section className="cron__explanation">
            <div className="cron__section-head">
              <h2>表达式解释</h2>
              <button
                type="button"
                aria-label="复制表达式"
                onClick={() => void copyValue(view.normalized, '已复制表达式')}
              >
                复制表达式
              </button>
            </div>
            <ul aria-label="表达式解释">
              {view.explanation
                .filter(line => line !== OR_EXPLANATION)
                .map(line => <li key={line}>{line}</li>)}
            </ul>
            {orExplanation && <p className="cron__or-notice" role="note">{orExplanation}</p>}
          </section>

          <section className="cron__preview">
            <div className="cron__section-head">
              <h2>未来 10 次运行时间</h2>
              <button
                type="button"
                aria-label="复制全部运行时间"
                onClick={() => void copyValue(
                  view.runs.map(run => `${run.local}\t${run.iso}`).join('\n'),
                  '已复制运行时间',
                )}
              >
                复制全部
              </button>
            </div>
            <div className="cron__table-wrap">
              <table aria-label="未来 10 次运行时间">
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">所选时区（{timeZone}）</th>
                    <th scope="col">ISO instant</th>
                  </tr>
                </thead>
                <tbody>
                  {view.runs.map((run, index) => (
                    <tr key={run.iso}>
                      <th scope="row">{index + 1}</th>
                      <td><code>{run.local}</code></td>
                      <td><code>{run.iso}</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {copyStatus && <p role="status" aria-live="polite">{copyStatus}</p>}
    </div>
  );
}
