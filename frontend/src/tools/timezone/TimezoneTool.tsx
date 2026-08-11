import { useRef, useState } from 'react';
import { ErrorView } from '../../components/ErrorView';
import { copyText } from '../../lib/copy';
import { listSupportedTimeZones } from '../../lib/timeZone';
import {
  compareTimeZones,
  formatInitialWallTime,
  type AmbiguityChoice,
  type ZoneRow,
} from './timezone';

const MAX_TARGETS = 4;

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function rowLabel(row: ZoneRow, targetIndex?: number): string {
  return row.role === 'source' ? '源时区结果' : `目标时区结果 ${targetIndex}`;
}

function zoneOptions(zones: readonly string[], targetTimeZones: readonly string[], current: string) {
  return zones.map((zone) => (
    <option key={zone} value={zone} disabled={zone !== current && targetTimeZones.includes(zone)}>
      {zone}
    </option>
  ));
}

export default function TimezoneTool() {
  const [browserZone] = useState(browserTimeZone);
  const zones = listSupportedTimeZones(browserZone);
  const [input, setInput] = useState(() => formatInitialWallTime(new Date(), browserZone));
  const [sourceTimeZone, setSourceTimeZone] = useState(browserZone);
  const [targetTimeZones, setTargetTimeZones] = useState<string[]>(['UTC']);
  const [ambiguityChoice, setAmbiguityChoice] = useState<AmbiguityChoice>();
  const [copyStatus, setCopyStatus] = useState('');
  const copyVersion = useRef(0);
  const comparison = compareTimeZones({ input, sourceTimeZone, targetTimeZones, ambiguityChoice });

  function clearSourceInteraction() {
    copyVersion.current += 1;
    setAmbiguityChoice(undefined);
    setCopyStatus('');
  }

  function clearTargetInteraction() {
    copyVersion.current += 1;
    setCopyStatus('');
  }

  function updateTarget(index: number, timeZone: string) {
    const next = [...targetTimeZones];
    next[index] = timeZone;
    clearTargetInteraction();
    setTargetTimeZones(next);
  }

  function addTarget() {
    const nextTimeZone = zones.find((zone) => !targetTimeZones.includes(zone));
    if (!nextTimeZone || targetTimeZones.length >= MAX_TARGETS) return;
    clearTargetInteraction();
    setTargetTimeZones([...targetTimeZones, nextTimeZone]);
  }

  function removeTarget(index: number) {
    if (targetTimeZones.length === 1) return;
    clearTargetInteraction();
    setTargetTimeZones(targetTimeZones.filter((_, targetIndex) => targetIndex !== index));
  }

  function moveTarget(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= targetTimeZones.length) return;
    const next = [...targetTimeZones];
    [next[index], next[destination]] = [next[destination], next[index]];
    clearTargetInteraction();
    setTargetTimeZones(next);
  }

  async function copy(value: string) {
    const version = copyVersion.current + 1;
    copyVersion.current = version;
    setCopyStatus('');
    const result = await copyText(value);
    if (copyVersion.current === version) setCopyStatus(result.ok ? '已复制' : result.message);
  }

  function renderRow(row: ZoneRow, targetIndex?: number) {
    const label = rowLabel(row, targetIndex);
    const copyName = row.role === 'source' ? '复制源时间' : `复制目标时间 ${targetIndex}`;
    return (
      <section key={`${row.role}-${targetIndex ?? 0}`} aria-label={label}>
        <h2>{row.role === 'source' ? '源时区' : `目标时区 ${targetIndex}`}</h2>
        <p>{row.timeZone}</p>
        <p>{row.date} {row.time}</p>
        <p>{row.offset}</p>
        <p>{row.dayDelta === 0 ? '与源日期同日' : `${row.dayDelta > 0 ? '+' : ''}${row.dayDelta} 天`}</p>
        <button type="button" aria-label={copyName} onClick={() => void copy(row.copyText)}>复制</button>
      </section>
    );
  }

  return (
    <div className="timezone">
      <div className="timezone__controls">
        <label htmlFor="timezone-input">源日期和时间</label>
        <input
          id="timezone-input"
          type="datetime-local"
          value={input}
          onChange={event => {
            clearSourceInteraction();
            setInput(event.target.value);
          }}
        />
        <label htmlFor="timezone-source">源时区</label>
        <select
          id="timezone-source"
          value={sourceTimeZone}
          onChange={event => {
            clearSourceInteraction();
            setSourceTimeZone(event.target.value);
          }}
        >
          {zones.map(zone => <option key={zone} value={zone}>{zone}</option>)}
        </select>

        {targetTimeZones.map((targetTimeZone, index) => (
          <div key={`${index}-${targetTimeZone}`}>
            <label htmlFor={`timezone-target-${index}`}>目标时区 {index + 1}</label>
            <select
              id={`timezone-target-${index}`}
              value={targetTimeZone}
              onChange={event => updateTarget(index, event.target.value)}
            >
              {zoneOptions(zones, targetTimeZones, targetTimeZone)}
            </select>
            <button
              type="button"
              aria-label={`上移目标时区 ${index + 1}`}
              disabled={index === 0}
              onClick={() => moveTarget(index, -1)}
            >
              上移
            </button>
            <button
              type="button"
              aria-label={`下移目标时区 ${index + 1}`}
              disabled={index === targetTimeZones.length - 1}
              onClick={() => moveTarget(index, 1)}
            >
              下移
            </button>
            <button
              type="button"
              aria-label={`删除目标时区 ${index + 1}`}
              disabled={targetTimeZones.length === 1}
              onClick={() => removeTarget(index)}
            >
              删除
            </button>
          </div>
        ))}
        <button type="button" onClick={addTarget} disabled={targetTimeZones.length >= MAX_TARGETS}>添加目标时区</button>
      </div>

      {(comparison.status === 'invalid' || comparison.status === 'gap') && <ErrorView message={comparison.message} />}

      {comparison.status === 'ambiguous' && (
        <fieldset>
          <legend>请选择夏令时结束时刻</legend>
          {comparison.choices.map(choice => (
            <label key={choice.choice}>
              <input
                type="radio"
                name="timezone-ambiguity"
                value={choice.choice}
                checked={ambiguityChoice === choice.choice}
                onChange={() => {
                  copyVersion.current += 1;
                  setCopyStatus('');
                  setAmbiguityChoice(choice.choice);
                }}
              />
              {choice.choice === 'earlier' ? '较早' : '较晚'}：{choice.offset}（{choice.iso}）
            </label>
          ))}
        </fieldset>
      )}

      {comparison.status === 'ready' && (
        <div aria-label="时区转换结果">
          {renderRow(comparison.rows[0])}
          {comparison.rows.slice(1).map((row, index) => renderRow(row, index + 1))}
          <button type="button" onClick={() => void copy(comparison.copyText)}>复制全部</button>
        </div>
      )}
      {copyStatus && <p role="status" aria-live="polite">{copyStatus}</p>}
    </div>
  );
}
