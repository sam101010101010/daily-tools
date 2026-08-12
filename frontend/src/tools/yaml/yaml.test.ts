import { describe, expect, it } from 'vitest';
import { processYaml } from './yaml';

const TWO_MIB = 2 * 1024 * 1024;
const LOSSY_YAML_WARNING = 'YAML 转换为 JSON 会省略注释、锚点和标量样式。';

function nestedFlowSequence(depth: number): string {
  return `${'['.repeat(depth)}null${']'.repeat(depth)}\n`;
}

function aliasList(count: number): string {
  return `source: &source value\naliases:\n${'  - *source\n'.repeat(count)}`;
}

const NESTED_ALIAS_FAN_OUT = [
  'seed: &seed value',
  'level1: &level1 [*seed, *seed, *seed]',
  'level2: &level2 [*level1, *level1, *level1]',
  'level3: &level3 [*level2, *level2, *level2]',
  'level4: &level4 [*level3, *level3, *level3]',
  'output: *level4',
  '',
].join('\n');

describe('format-yaml contract', () => {
  it('keeps YAML 1.2 scalar meanings instead of applying YAML 1.1 boolean coercion', () => {
    const result = processYaml({
      mode: 'format-yaml',
      input: [
        'enabled: true',
        'legacyBoolean: yes',
        'nothing: null',
        'count: 42',
        'ratio: 1.5',
        'quoted: "042"',
        '',
      ].join('\n'),
    });

    expect(result).toEqual({
      kind: 'success',
      output: [
        'enabled: true',
        'legacyBoolean: yes',
        'nothing: null',
        'count: 42',
        'ratio: 1.5',
        'quoted: "042"',
        '',
      ].join('\n'),
      warnings: [],
    });
  });

  it('normalizes nested mappings and sequences to deterministic two-space indentation', () => {
    const result = processYaml({
      mode: 'format-yaml',
      input: 'service:\n name: api\n ports:\n - 80\n - 443\n',
    });

    expect(result).toEqual({
      kind: 'success',
      output: 'service:\n  name: api\n  ports:\n    - 80\n    - 443\n',
      warnings: [],
    });
  });

  it('preserves literal and folded block scalar styles supported by the parser', () => {
    const result = processYaml({
      mode: 'format-yaml',
      input: 'literal: |\n  first\n  second\nfolded: >\n  first\n  second\n',
    });

    expect(result).toEqual({
      kind: 'success',
      output: 'literal: |\n  first\n  second\nfolded: >\n  first second\n',
      warnings: [],
    });
  });

  it('preserves parser-supported comments and non-cyclic anchors while formatting YAML', () => {
    const result = processYaml({
      mode: 'format-yaml',
      input: '# before\nservice: &service\n  name: api # inline\ncopy: *service\n',
    });

    expect(result).toEqual({
      kind: 'success',
      output: '# before\nservice: &service\n  name: api # inline\ncopy: *service\n',
      warnings: [],
    });
  });
});

describe('YAML and JSON conversion contract', () => {
  it('converts mappings, sequences and scalars to two-space JSON with a final newline', () => {
    const result = processYaml({
      mode: 'yaml-to-json',
      input: 'service:\n  name: api\n  enabled: true\n  ports: [80, 443]\n  note: null\n',
    });

    expect(result).toEqual({
      kind: 'success',
      output: [
        '{',
        '  "service": {',
        '    "name": "api",',
        '    "enabled": true,',
        '    "ports": [',
        '      80,',
        '      443',
        '    ],',
        '    "note": null',
        '  }',
        '}',
        '',
      ].join('\n'),
      warnings: [],
    });
  });

  it('resolves non-cyclic aliases but reports YAML representation loss exactly once', () => {
    const result = processYaml({
      mode: 'yaml-to-json',
      input: '# owner\nservice: &service\n  description: |\n    local API\ncopy: *service\n',
    });

    expect(result).toEqual({
      kind: 'success',
      output: [
        '{',
        '  "service": {',
        '    "description": "local API\\n"',
        '  },',
        '  "copy": {',
        '    "description": "local API\\n"',
        '  }',
        '}',
        '',
      ].join('\n'),
      warnings: [LOSSY_YAML_WARNING],
    });
  });

  it('converts only valid JSON values to deterministic two-space YAML with a final newline', () => {
    const result = processYaml({
      mode: 'json-to-yaml',
      input: '{"service":{"name":"api","ports":[80,443],"enabled":true}}',
    });

    expect(result).toEqual({
      kind: 'success',
      output: 'service:\n  name: api\n  ports:\n    - 80\n    - 443\n  enabled: true\n',
      warnings: [],
    });
  });

  it('rejects invalid JSON instead of accepting JavaScript extensions or trailing commas', () => {
    expect(processYaml({
      mode: 'json-to-yaml',
      input: '{"value": NaN,}',
    })).toEqual({
      kind: 'failure',
      message: '请输入有效的 JSON。',
      line: 1,
      column: 11,
    });
  });
});

describe('single-document and schema safety contract', () => {
  it('rejects an empty YAML stream rather than treating it as JSON null', () => {
    expect(processYaml({ mode: 'format-yaml', input: '  \n# comment only\n' })).toEqual({
      kind: 'failure',
      message: '请输入一个 YAML 文档。',
    });
  });

  it('rejects a YAML stream containing more than one document', () => {
    expect(processYaml({
      mode: 'format-yaml',
      input: '---\nfirst: 1\n---\nsecond: 2\n',
    })).toEqual({
      kind: 'failure',
      message: '只支持一个 YAML 文档。',
      line: 3,
      column: 1,
    });
  });

  it('rejects duplicate mapping keys and reports the second key position', () => {
    expect(processYaml({
      mode: 'yaml-to-json',
      input: 'name: first\nname: second\n',
    })).toEqual({
      kind: 'failure',
      message: 'YAML 包含重复的映射键。',
      line: 2,
      column: 1,
    });
  });

  it.each([
    ['local tag', 'value: !env HOME\n'],
    ['explicit non-Core tag', 'created: !!timestamp 2026-08-12\n'],
  ])('rejects unsupported %s without resolving or executing it', (_label, input) => {
    expect(processYaml({ mode: 'yaml-to-json', input })).toEqual({
      kind: 'failure',
      message: '不支持 YAML 自定义或扩展标签。',
      line: 1,
    });
  });

  it('maps malformed YAML to an accessible line and column diagnostic without a stack trace', () => {
    const result = processYaml({
      mode: 'format-yaml',
      input: 'service:\n  - name: api\n broken: true\n',
    });

    expect(result).toMatchObject({
      kind: 'failure',
      message: expect.any(String),
      line: 3,
      column: expect.any(Number),
    });
    expect(result).not.toHaveProperty('stack');
  });
});

describe('bounded resource contract', () => {
  it('accepts a document at the 100-level nesting boundary', () => {
    expect(processYaml({
      mode: 'yaml-to-json',
      input: nestedFlowSequence(100),
    })).toMatchObject({ kind: 'success' });
  });

  it('rejects nesting deeper than 100 levels before producing output', () => {
    expect(processYaml({
      mode: 'yaml-to-json',
      input: nestedFlowSequence(101),
    })).toEqual({
      kind: 'failure',
      message: 'YAML 嵌套不能超过 100 层。',
    });
  });

  it('accepts 100 flat alias references at the inclusive safety boundary', () => {
    expect(processYaml({
      mode: 'yaml-to-json',
      input: aliasList(100),
    })).toMatchObject({ kind: 'success' });
  });

  it('rejects 101 flat alias references beyond the inclusive safety boundary', () => {
    expect(processYaml({
      mode: 'yaml-to-json',
      input: aliasList(101),
    })).toEqual({
      kind: 'failure',
      message: 'YAML 别名展开超过 100 的安全上限。',
    });
  });

  it('rejects nested fan-out expansion even when the document has only 13 alias nodes', () => {
    expect(processYaml({
      mode: 'yaml-to-json',
      input: NESTED_ALIAS_FAN_OUT,
    })).toEqual({
      kind: 'failure',
      message: 'YAML 别名展开超过 100 的安全上限。',
    });
  });

  it('rejects cyclic aliases before serialization', () => {
    expect(processYaml({
      mode: 'format-yaml',
      input: 'loop: &loop [*loop]\n',
    })).toEqual({
      kind: 'failure',
      message: 'YAML 不能包含循环引用。',
    });
  });

  it('measures UTF-8 bytes and rejects input larger than 2 MiB', () => {
    const oversizedUtf8 = '你'.repeat(Math.floor(TWO_MIB / 3) + 1);

    expect(processYaml({ mode: 'format-yaml', input: oversizedUtf8 })).toEqual({
      kind: 'failure',
      message: '输入不能超过 2 MiB（按 UTF-8 计算）。',
    });
  });

  it('accepts valid YAML whose UTF-8 encoding is exactly 2 MiB', () => {
    const wrapper = 'value: ""\n';
    const input = `value: "${'a'.repeat(TWO_MIB - wrapper.length)}"\n`;

    expect(new TextEncoder().encode(input)).toHaveLength(TWO_MIB);
    expect(processYaml({ mode: 'format-yaml', input })).toMatchObject({ kind: 'success' });
  });
});

describe('finite JSON representation contract', () => {
  it.each([
    ['NaN', 'value: .nan\n'],
    ['positive infinity', 'value: .inf\n'],
    ['negative infinity', 'value: -.inf\n'],
    ['unsafe integer', 'value: 9007199254740993\n'],
    ['non-string mapping key', '? [left, right]\n: value\n'],
  ])('rejects YAML %s instead of silently coercing it to JSON', (_label, input) => {
    expect(processYaml({ mode: 'yaml-to-json', input })).toEqual({
      kind: 'failure',
      message: 'YAML 包含无法无损表示为有限 JSON 的值。',
    });
  });
});
