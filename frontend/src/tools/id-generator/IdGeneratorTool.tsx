import { useRef, useState } from 'react';
import { copyText } from '../../lib/copy';
import {
  generateIds,
  IdInspectionErrorCode,
  IdKind,
  inspectId,
  type IdInspection,
  type IdKind as IdKindValue,
} from './ids';

const TYPE_LABELS: Readonly<Record<IdKindValue, string>> = {
  [IdKind.UUID_V4]: 'UUID v4',
  [IdKind.UUID_V7]: 'UUID v7',
  [IdKind.ULID]: 'ULID',
};

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function InspectionDetails({ inspection }: { inspection: Exclude<IdInspection, { kind: 'invalid' }> }) {
  const timestamp = 'timestamp' in inspection && typeof inspection.timestamp === 'number'
    ? formatTimestamp(inspection.timestamp)
    : '不包含时间';

  return (
    <dl className="id-generator__inspection">
      <dt>类型</dt>
      <dd aria-label="类型">{TYPE_LABELS[inspection.kind]}</dd>
      {'version' in inspection && (
        <>
          <dt>版本</dt>
          <dd>{inspection.version}</dd>
          <dt>变体</dt>
          <dd>{inspection.variant}</dd>
        </>
      )}
      <dt>规范值</dt>
      <dd><code>{inspection.canonical}</code></dd>
      <dt>时间</dt>
      <dd aria-label="时间">{timestamp}</dd>
    </dl>
  );
}

function inspectionError(errorCode: IdInspectionErrorCode): string {
  return errorCode === IdInspectionErrorCode.TIME_OVERFLOW
    ? 'ULID 时间戳超出可检查范围'
    : '无法识别该标识符';
}

export default function IdGeneratorTool() {
  const [kind, setKind] = useState<IdKindValue>(IdKind.UUID_V4);
  const [count, setCount] = useState('1');
  const [ids, setIds] = useState<readonly string[]>([]);
  const [generationError, setGenerationError] = useState('');
  const [copyStatus, setCopyStatus] = useState<{ id: number; message: string }>();
  const [inspectionInput, setInspectionInput] = useState('');
  const copyVersion = useRef(0);

  const normalizedInspectionInput = inspectionInput.trim();
  const inspection = normalizedInspectionInput === ''
    ? undefined
    : inspectId(normalizedInspectionInput);

  function resetCopyState() {
    copyVersion.current += 1;
    setCopyStatus(undefined);
  }

  function generate() {
    resetCopyState();
    const parsedCount = Number(count);

    try {
      setIds(generateIds({ kind, count: parsedCount }));
      setGenerationError('');
    } catch {
      setIds([]);
      setGenerationError('生成数量必须是 1 到 100 之间的整数');
    }
  }

  async function copy(value: string, successMessage: string) {
    const version = ++copyVersion.current;
    const result = await copyText(value);
    if (copyVersion.current !== version) return;

    setCopyStatus({
      id: version,
      message: result.ok ? successMessage : result.message,
    });
  }

  function copyOne(id: string, index: number) {
    return copy(id, `第 ${index + 1} 个标识符已复制`);
  }

  function copyAll() {
    return copy(ids.join('\n'), '全部标识符已复制');
  }

  return (
    <div className="id-generator">
      <section className="id-generator__card" aria-labelledby="id-generator-generation-heading">
        <h2 id="id-generator-generation-heading">生成标识符</h2>
        <p>UUID v4 是随机标识符；UUID v7 按时间排序并编码生成时间；ULID 是可按字典序排序的紧凑标识符。</p>

        <div className="id-generator__controls">
          <label htmlFor="id-generator-kind">标识符类型</label>
          <select
            id="id-generator-kind"
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as IdKindValue);
              resetCopyState();
            }}
          >
            <option value={IdKind.UUID_V4}>UUID v4</option>
            <option value={IdKind.UUID_V7}>UUID v7</option>
            <option value={IdKind.ULID}>ULID</option>
          </select>

          <label htmlFor="id-generator-count">生成数量</label>
          <input
            id="id-generator-count"
            type="number"
            min="1"
            max="100"
            step="1"
            value={count}
            onChange={(event) => {
              setCount(event.target.value);
              setGenerationError('');
              resetCopyState();
            }}
          />

          <button type="button" onClick={generate}>生成标识符</button>
        </div>

        {generationError && <p role="alert">{generationError}</p>}

        {ids.length > 0 && (
          <div className="id-generator__output">
            <div className="id-generator__output-heading">
              <h3>生成结果</h3>
              <button type="button" onClick={() => void copyAll()}>全部复制</button>
            </div>
            <ol
              className="id-generator__results id-generator__results--scrollable"
              aria-label="生成结果"
              style={{ maxHeight: '24rem', overflowY: 'auto' }}
              tabIndex={0}
            >
              {ids.map((id, index) => (
                <li key={id}>
                  <code>{id}</code>
                  <button
                    type="button"
                    aria-label={`复制第 ${index + 1} 个标识符`}
                    onClick={() => void copyOne(id, index)}
                  >
                    复制
                  </button>
                </li>
              ))}
            </ol>
          </div>
        )}

        {copyStatus && (
          <p key={copyStatus.id} role="status" aria-live="polite">{copyStatus.message}</p>
        )}
      </section>

      <section className="id-generator__card" aria-labelledby="id-generator-inspection-heading">
        <h2 id="id-generator-inspection-heading">检查标识符</h2>
        <label htmlFor="id-generator-inspection-input">待检查标识符</label>
        <input
          id="id-generator-inspection-input"
          value={inspectionInput}
          onChange={(event) => setInspectionInput(event.target.value)}
          placeholder="粘贴 UUID v4、UUID v7 或 ULID"
        />

        {inspection?.kind === 'invalid' && (
          <p role="alert">{inspectionError(inspection.errorCode)}</p>
        )}
        {inspection !== undefined && inspection.kind !== 'invalid' && (
          <InspectionDetails inspection={inspection} />
        )}
      </section>
    </div>
  );
}
