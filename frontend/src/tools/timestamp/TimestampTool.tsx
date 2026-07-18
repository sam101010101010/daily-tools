import { useState } from 'react';
import { ErrorView } from '../../components/ErrorView';
import { copyText } from '../../lib/copy';
import { convertTimestamp, formatInTimeZone, type TimestampInputType } from './timestamp';

const EXAMPLE_ISO = '2024-01-01T00:00:00.000Z';

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

function Output({ label, value }: { label: string; value: string }) {
  const [status, setStatus] = useState('');

  async function copy() {
    const result = await copyText(value);
    setStatus(result.ok ? '已复制' : result.message);
  }

  return (
    <div className="timestamp__output">
      <div className="timestamp__output-head"><span>{label}</span><button type="button" aria-label={`复制 ${label}`} onClick={() => void copy()}>复制</button></div>
      <code aria-label={label}>{value}</code>
      {status && <span role="status" aria-live="polite">{status}</span>}
    </div>
  );
}

export default function TimestampTool() {
  const defaultTimeZone = browserTimeZone();
  const [input, setInput] = useState(EXAMPLE_ISO);
  const [inputType, setInputType] = useState<TimestampInputType>('auto');
  const [timeZone, setTimeZone] = useState(defaultTimeZone);
  const result = convertTimestamp(input, inputType, timeZone);
  const zones = supportedTimeZones(defaultTimeZone);

  return (
    <div className="timestamp">
      <div className="timestamp__controls">
        <label htmlFor="timestamp-input">时间输入</label>
        <input id="timestamp-input" aria-label="时间输入" value={input} onChange={event => setInput(event.target.value)} />
        <label htmlFor="timestamp-input-type">输入格式</label>
        <select id="timestamp-input-type" aria-label="输入格式" value={inputType} onChange={event => setInputType(event.target.value as TimestampInputType)}>
          <option value="auto">自动识别</option>
          <option value="seconds">Unix 秒</option>
          <option value="milliseconds">Unix 毫秒</option>
          <option value="iso">ISO 8601</option>
        </select>
        <label htmlFor="timestamp-time-zone">时区</label>
        <select id="timestamp-time-zone" aria-label="时区" value={timeZone} onChange={event => setTimeZone(event.target.value)}>
          {zones.map(zone => <option key={zone} value={zone}>{zone}</option>)}
        </select>
      </div>
      {!result.ok && <ErrorView message={result.error} />}
      {result.ok && <div className="timestamp__outputs" aria-label="转换结果">
        <Output label="所选时区日期" value={formatInTimeZone(result.value.epochMilliseconds, timeZone)} />
        <Output label="ISO 8601" value={result.value.iso} />
        <Output label="Unix 秒" value={result.value.epochSeconds} />
        <Output label="Unix 毫秒" value={String(result.value.epochMilliseconds)} />
      </div>}
    </div>
  );
}
