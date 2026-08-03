import { useState } from 'react';
import { copyText } from '../../lib/copy';
import { calculateTextStats } from './textStats';
import { applyTextOperation, type TextOperation } from './textOperations';

export const DEFAULT_TEXT_INPUT = '  Hello World  \nhello world\n重复行\n重复行\n\n  中文 😀  ';

const operationGroups: Array<{ label: string; operations: Array<{ value: TextOperation; label: string }> }> = [
  {
    label: '文本大小写',
    operations: [
      { value: 'uppercase', label: '转为大写' },
      { value: 'lowercase', label: '转为小写' },
    ],
  },
  {
    label: '空白与行',
    operations: [
      { value: 'trim', label: '去除首尾空白' },
      { value: 'trim-lines', label: '去除每行首尾空白' },
      { value: 'collapse-horizontal-whitespace', label: '合并横向空白' },
      { value: 'remove-blank-lines', label: '删除空白行' },
    ],
  },
  {
    label: '行顺序',
    operations: [
      { value: 'sort-ascending', label: '按升序排序行' },
      { value: 'sort-descending', label: '按降序排序行' },
      { value: 'reverse-lines', label: '反转行顺序' },
      { value: 'dedupe-lines', label: '去重行' },
    ],
  },
];

interface StatsProps {
  prefix: '原始' | '结果';
  input: string;
}

function TextStats({ prefix, input }: StatsProps) {
  const stats = calculateTextStats(input);

  return (
    <dl>
      <div><dt>{prefix}字符数</dt><dd aria-label={`${prefix}字符数`}>{stats.characters}</dd></div>
      <div><dt>{prefix}词数</dt><dd aria-label={`${prefix}词数`}>{stats.words}</dd></div>
      <div><dt>{prefix}行数</dt><dd aria-label={`${prefix}行数`}>{stats.lines}</dd></div>
      <div><dt>{prefix}字节数</dt><dd aria-label={`${prefix}字节数`}>{stats.bytes}</dd></div>
    </dl>
  );
}

export default function TextTool() {
  const [input, setInput] = useState(DEFAULT_TEXT_INPUT);
  const [operation, setOperation] = useState<TextOperation>('uppercase');
  const [result, setResult] = useState('');
  const [status, setStatus] = useState('');
  const [statusVersion, setStatusVersion] = useState(0);

  function announce(message: string) {
    setStatus('');
    setStatusVersion((version) => version + 1);
    setStatus(message);
  }

  function processText() {
    setResult(applyTextOperation({ operation, input }).output);
    announce('处理完成');
  }

  function useResultAsInput() {
    setInput(result);
    setResult('');
    announce('结果已作为输入');
  }

  function reset() {
    setInput(DEFAULT_TEXT_INPUT);
    setOperation('uppercase');
    setResult('');
    announce('已重置');
  }

  async function copyResult() {
    const copyResult = await copyText(result);
    announce(copyResult.ok ? '已复制结果' : copyResult.message);
  }

  return (
    <section className="text-tool" aria-label="文本处理">
      <form onSubmit={(event) => { event.preventDefault(); processText(); }}>
        <label htmlFor="text-operation">处理操作</label>
        <select
          id="text-operation"
          value={operation}
          onChange={(event) => setOperation(event.target.value as TextOperation)}
        >
          {operationGroups.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.operations.map((candidate) => (
                <option key={candidate.value} value={candidate.value}>{candidate.label}</option>
              ))}
            </optgroup>
          ))}
        </select>

        <div className="text-tool__columns">
          <div>
            <label htmlFor="text-input">原始文本</label>
            <textarea
              id="text-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault();
                  processText();
                }
              }}
            />
            <TextStats prefix="原始" input={input} />
          </div>
          <div>
            <label htmlFor="text-result">处理结果</label>
            <textarea id="text-result" value={result} readOnly />
            <TextStats prefix="结果" input={result} />
          </div>
        </div>

        <div className="text-tool__actions">
          <button type="submit">处理</button>
          <button type="button" onClick={() => void copyResult()}>复制结果</button>
          <button type="button" onClick={useResultAsInput}>结果作为输入</button>
          <button type="button" onClick={reset}>重置</button>
        </div>
      </form>
      <p key={statusVersion} role="status" aria-live="polite">{status}</p>
    </section>
  );
}
