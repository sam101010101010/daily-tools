import { useState } from 'react';
import { ErrorView } from '../../components/ErrorView';
import { copyText } from '../../lib/copy';
import { explainCron } from './cronExplain';
import { previewCron, type CronRun } from './cronPreview';
import { CRON_PROFILES, getCronProfile, type CronProfile, type CronProfileFieldName, type CronProfileId } from './profiles';
import { parseCron, type ProfileSyntaxError } from './profileSyntax';

const PREVIEW_FAILURE = '无法生成预览，请检查所选 Cron 方言与 IANA 时区。';

const FIELD_LABELS: Record<CronProfileFieldName | 'expression', string> = {
  expression: '表达式',
  second: '秒',
  minute: '分钟',
  hour: '小时',
  dayOfMonth: '日期',
  month: '月份',
  dayOfWeek: '星期',
  year: '年份',
};

type SuccessView = Readonly<{
  kind: 'success';
  profile: CronProfileId;
  normalized: string;
  explanation: readonly string[];
  runs: readonly CronRun[];
  timeZone: string;
}>;

type ErrorViewState = Readonly<{
  kind: 'error';
  profile: CronProfileId;
  message: string;
}>;

type ViewState = SuccessView | ErrorViewState | null;

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

function fieldHint(profile: CronProfile, field: CronProfileFieldName): string {
  const weekday = profile.id === 'kubernetes'
    ? '星期（0–6 / SUN–SAT）'
    : profile.id === 'quartz' || profile.id.startsWith('eventbridge-')
      ? '星期（1–7 / SUN–SAT）'
      : '星期（0–7 / SUN–SAT）';
  const hints: Record<CronProfileFieldName, string> = {
    second: '秒（0–59）',
    minute: '分钟（0–59）',
    hour: '小时（0–23）',
    dayOfMonth: '日期（1–31）',
    month: '月份（1–12 / JAN–DEC）',
    dayOfWeek: weekday,
    year: profile.id.startsWith('eventbridge-') ? '年份（1970–2199）' : '年份（1–9999）',
  };
  return hints[field];
}

function profileNotice(profile: CronProfile): string {
  if (profile.domDowPolicy === 'or') return '日期和星期均受限时，任一条件满足即可执行';
  if (profile.domDowPolicy === 'spring') return 'Spring 的日期和星期字段按其规则共同约束；? 表示未指定。';
  return '日期和星期字段必须且只能有一个使用 ?';
}

function timeZoneNotice(profile: CronProfile): string {
  switch (profile.timeZoneMode) {
    case 'kubernetes-spec-time-zone': return '时区由 Kubernetes spec.timeZone 单独提供；表达式内不能使用 TZ 或 CRON_TZ。';
    case 'scheduler-iana': return 'EventBridge Scheduler 使用所选 IANA 时区预览。';
    case 'utc-only': return '固定 UTC（EventBridge legacy rule）';
    case 'target-iana': return '按目标机器或调度器的 IANA 时区预览。';
  }
}

function syntaxErrorMessage(error: ProfileSyntaxError): string {
  if (error.field === 'expression') return error.message;
  return `${FIELD_LABELS[error.field]}字段：${error.message}`;
}

function evaluate(profile: CronProfileId, expression: string, timeZone: string, now: Date): Exclude<ViewState, null> {
  try {
    const parsed = parseCron(profile, expression);
    if (!parsed.ok) {
      return {
        kind: 'error',
        profile: parsed.error.profile,
        message: syntaxErrorMessage(parsed.error),
      };
    }
    if (parsed.value.profile !== profile) return { kind: 'error', profile, message: PREVIEW_FAILURE };

    const explanation = explainCron(parsed.value);
    const preview = previewCron(parsed.value, timeZone, now);
    if (parsed.value.profile !== explanation.profile || parsed.value.profile !== preview.profile) {
      return { kind: 'error', profile, message: PREVIEW_FAILURE };
    }
    if (!preview.ok) return { kind: 'error', profile, message: `时区：${preview.error}。` };

    return {
      kind: 'success',
      profile,
      normalized: parsed.value.normalized,
      explanation: explanation.lines,
      runs: preview.value.runs,
      timeZone: preview.value.timeZone,
    };
  } catch {
    return { kind: 'error', profile, message: PREVIEW_FAILURE };
  }
}

export default function CronTool({ now = () => new Date() }: CronToolProps) {
  const [profileId, setProfileId] = useState<CronProfileId | null>(null);
  const [expression, setExpression] = useState('');
  const [timeZone, setTimeZone] = useState(browserTimeZone);
  const [view, setView] = useState<ViewState>(null);
  const [copyStatus, setCopyStatus] = useState('');
  const profile = profileId ? getCronProfile(profileId) : null;
  const zones = supportedTimeZones(timeZone);

  function invalidate(next: () => void) {
    next();
    setView(null);
    setCopyStatus('');
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    setCopyStatus('');
    setView(evaluate(profile.id, expression, timeZone, now()));
  }

  async function copyValue(value: string, successMessage: string) {
    const result = await copyText(value);
    setCopyStatus(result.ok ? successMessage : result.message);
  }

  return (
    <div className="cron">
      <header className="cron__intro">
        <span className="cron__badge" data-testid="cron-profile-badge">{profile?.label ?? '未选择 Cron 方言'}</span>
        <p>仅解释和预览，不会执行任务、注册定时器或保存输入。</p>
      </header>

      <form className="cron__form" onSubmit={submit}>
        <label htmlFor="cron-profile">目标 Cron 方言</label>
        <select
          id="cron-profile"
          className="cron__profile-selector"
          aria-label="Cron 方言 profile"
          value={profileId ?? ''}
          onChange={(event) => invalidate(() => setProfileId(event.target.value as CronProfileId || null))}
        >
          <option value="">请选择目标平台</option>
          {CRON_PROFILES.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.label}</option>)}
        </select>

        {!profile && <p className="cron__profile-required" role="status">请先选择目标 Cron 方言，再输入并生成预览。</p>}

        {profile && (
          <>
            <div className="cron__profile-notice" role="note">
              <p>{profileNotice(profile)}</p>
              {profile.wrapper === 'cron-required' && <p>必须使用 cron(...) 外壳</p>}
              <p>{timeZoneNotice(profile)}</p>
            </div>

            <ol className="cron__field-legend" aria-label="字段顺序">
              {profile.fieldOrder.map((field) => <li key={field}>{fieldHint(profile, field)}</li>)}
            </ol>
          </>
        )}

        <label htmlFor="cron-expression">Cron 表达式</label>
        <div className="cron__expression-row">
          <input
            id="cron-expression"
            aria-label="Cron 表达式"
            autoComplete="off"
            spellCheck={false}
            disabled={!profile}
            placeholder={profile?.defaultExpression}
            value={expression}
            onChange={event => invalidate(() => setExpression(event.target.value))}
          />
          <button type="button" disabled={!profile} onClick={() => profile && invalidate(() => setExpression(profile.defaultExpression))}>填入示例</button>
          <button type="submit" disabled={!profile}>生成预览</button>
        </div>

        {profile?.timeZoneMode !== 'utc-only' && (
          <>
            <label htmlFor="cron-time-zone">
              {profile?.timeZoneMode === 'kubernetes-spec-time-zone' ? 'Kubernetes spec.timeZone' : 'IANA 时区'}
            </label>
            <select
              id="cron-time-zone"
              aria-label={profile?.timeZoneMode === 'kubernetes-spec-time-zone' ? 'Kubernetes spec.timeZone' : 'IANA 时区'}
              value={timeZone}
              onChange={event => invalidate(() => setTimeZone(event.target.value))}
            >
              {zones.map(zone => <option key={zone} value={zone}>{zone}</option>)}
            </select>
          </>
        )}
      </form>

      {view?.kind === 'error' && <div data-cron-profile={view.profile}><ErrorView message={view.message} /></div>}

      {view?.kind === 'success' && (
        <div className="cron__results" data-cron-profile={view.profile}>
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
              {view.explanation.map(line => <li key={line}>{line}</li>)}
            </ul>
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
                    <th scope="col">所选时区（{view.timeZone}）</th>
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
