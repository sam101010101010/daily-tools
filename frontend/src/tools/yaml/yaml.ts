import {
  Document,
  LineCounter,
  isAlias,
  isMap,
  isScalar,
  isSeq,
  parseAllDocuments,
  type Node,
  type ParsedNode,
} from 'yaml';

export type YamlToolMode = 'format-yaml' | 'yaml-to-json' | 'json-to-yaml';

export type YamlToolRequest = {
  mode: YamlToolMode;
  input: string;
};

export type YamlToolResult =
  | { kind: 'success'; output: string; warnings: string[] }
  | { kind: 'failure'; message: string; line?: number; column?: number };

const MAX_INPUT_BYTES = 2 * 1024 * 1024;
const MAX_NODES = 10_000;
const MAX_DEPTH = 100;
const MAX_ALIAS_COUNT = 101;
const LOSSY_YAML_WARNING = 'YAML 转换为 JSON 会省略注释、锚点和标量样式。';
const JSON_VALUE_FAILURE = 'YAML 包含无法无损表示为有限 JSON 的值。';

const CORE_TAGS = new Set([
  'tag:yaml.org,2002:null',
  'tag:yaml.org,2002:bool',
  'tag:yaml.org,2002:int',
  'tag:yaml.org,2002:float',
  'tag:yaml.org,2002:str',
  'tag:yaml.org,2002:seq',
  'tag:yaml.org,2002:map',
]);

type Failure = Extract<YamlToolResult, { kind: 'failure' }>;

type AstInspection = {
  failure?: Failure;
  tagOffset?: number;
  losesYamlRepresentation: boolean;
};

function failure(message: string, line?: number, column?: number): Failure {
  return {
    kind: 'failure',
    message,
    ...(line === undefined ? {} : { line }),
    ...(column === undefined ? {} : { column }),
  };
}

function inputTooLarge(input: string): boolean {
  return new TextEncoder().encode(input).byteLength > MAX_INPUT_BYTES;
}

function childrenOf(node: Node): Node[] {
  if (isSeq(node)) return node.items.filter((item): item is Node => item !== null);
  if (!isMap(node)) return [];

  const children: Node[] = [];
  for (const pair of node.items) {
    if (pair.key !== null) children.push(pair.key as Node);
    if (pair.value !== null) children.push(pair.value as Node);
  }
  return children;
}

function inspectAst(root: ParsedNode): AstInspection {
  let nodes = 0;
  let losesYamlRepresentation = false;
  const stack: Array<{ node: Node; depth: number; root: boolean }> = [
    { node: root, depth: 0, root: true },
  ];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;

    const { node, root: isRoot } = current;
    const depth = current.depth + (isMap(node) || isSeq(node) ? 1 : 0);

    if (!isRoot) {
      nodes += 1;
      if (nodes > MAX_NODES) {
        return {
          failure: failure('输入节点过多（最多 10000 个）'),
          losesYamlRepresentation,
        };
      }
    }

    if (depth > MAX_DEPTH) {
      return {
        failure: failure('YAML 嵌套不能超过 100 层。'),
        losesYamlRepresentation,
      };
    }

    if (node.tag && !CORE_TAGS.has(node.tag)) {
      const line = node.range?.[0];
      return {
        failure: failure('不支持 YAML 自定义或扩展标签。'),
        tagOffset: line,
        losesYamlRepresentation,
      };
    }

    if (node.comment || node.commentBefore || ('anchor' in node && node.anchor)) {
      losesYamlRepresentation = true;
    }
    if (isAlias(node) || (isScalar(node) && node.type !== undefined && node.type !== 'PLAIN')) {
      losesYamlRepresentation = true;
    }

    const children = childrenOf(node);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child) stack.push({ node: child, depth, root: false });
    }
  }

  return { losesYamlRepresentation };
}

function hasAliasCycle(document: Document<ParsedNode>, root: Node): boolean {
  const active = new Set<Node>();
  const complete = new Set<Node>();

  function visitNode(node: Node): boolean {
    if (isAlias(node)) {
      const target = node.resolve(document);
      return target ? visitNode(target) : false;
    }
    if (active.has(node)) return true;
    if (complete.has(node)) return false;

    active.add(node);
    for (const child of childrenOf(node)) {
      if (visitNode(child)) return true;
    }
    active.delete(node);
    complete.add(node);
    return false;
  }

  return visitNode(root);
}

function lineColumn(lineCounter: LineCounter, offset: number): { line: number; column: number } {
  const position = lineCounter.linePos(offset);
  return { line: position.line, column: position.col };
}

function yamlError(document: Document<ParsedNode>, lineCounter: LineCounter): Failure | undefined {
  const tagWarning = document.warnings.find((warning) => warning.code === 'TAG_RESOLVE_FAILED');
  if (tagWarning) {
    return failure(
      '不支持 YAML 自定义或扩展标签。',
      lineCounter.linePos(tagWarning.pos[0]).line,
    );
  }

  const error = document.errors[0] ?? document.warnings[0];
  if (!error) return undefined;

  const position = lineColumn(lineCounter, error.pos[0]);
  if (error.code === 'DUPLICATE_KEY') {
    return failure('YAML 包含重复的映射键。', position.line, position.column);
  }
  return failure('YAML 格式无效。', position.line, position.column);
}

function materialize(document: Document<ParsedNode>): unknown | Failure {
  try {
    return document.toJS({ mapAsMap: true, maxAliasCount: MAX_ALIAS_COUNT });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Excessive alias count')) {
      return failure('YAML 别名展开超过 100 的安全上限。');
    }
    return failure('YAML 格式无效。');
  }
}

function finiteJsonValue(value: unknown): unknown | Failure {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') {
    return value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER)
      ? Number(value)
      : failure(JSON_VALUE_FAILURE);
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value))
      ? value
      : failure(JSON_VALUE_FAILURE);
  }
  if (Array.isArray(value)) {
    const result: unknown[] = [];
    for (const item of value) {
      const converted = finiteJsonValue(item);
      if (isFailure(converted)) return converted;
      result.push(converted);
    }
    return result;
  }
  if (value instanceof Map) {
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const [key, item] of value) {
      if (typeof key !== 'string') return failure(JSON_VALUE_FAILURE);
      const converted = finiteJsonValue(item);
      if (isFailure(converted)) return converted;
      result[key] = converted;
    }
    return result;
  }
  return failure(JSON_VALUE_FAILURE);
}

function isFailure(value: unknown): value is Failure {
  return typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'failure';
}

function parseYaml(input: string):
  | { document: Document<ParsedNode>; inspection: AstInspection }
  | Failure {
  const lineCounter = new LineCounter();
  let documents: Document<ParsedNode>[];

  try {
    documents = parseAllDocuments(input, {
      customTags: [],
      intAsBigInt: true,
      lineCounter,
      prettyErrors: false,
      resolveKnownTags: false,
      schema: 'core',
      uniqueKeys: true,
      version: '1.2',
    }) as Document<ParsedNode>[];
  } catch {
    return failure('YAML 格式无效。');
  }

  if (documents.length > 1) {
    const secondOffset = documents[1]?.range?.[0] ?? 0;
    const position = lineColumn(lineCounter, secondOffset);
    return failure('只支持一个 YAML 文档。', position.line, position.column);
  }

  const document = documents[0];
  if (!document || document.contents === null) return failure('请输入一个 YAML 文档。');

  const parserFailure = yamlError(document, lineCounter);
  if (parserFailure) return parserFailure;

  const inspection = inspectAst(document.contents);
  if (inspection.failure) {
    if (inspection.tagOffset !== undefined) {
      const position = lineCounter.linePos(inspection.tagOffset);
      return failure(inspection.failure.message, position.line);
    }
    return inspection.failure;
  }
  if (hasAliasCycle(document, document.contents)) return failure('YAML 不能包含循环引用。');

  return { document, inspection };
}

function jsonErrorOffset(input: string): number | undefined {
  let index = 0;

  function whitespace(): void {
    while (/\s/u.test(input[index] ?? '')) index += 1;
  }

  function string(): boolean {
    index += 1;
    while (index < input.length) {
      const character = input[index];
      if (character === '"') {
        index += 1;
        return true;
      }
      if (character === '\\') {
        index += 1;
        const escape = input[index];
        if (escape === 'u') {
          if (!/^[0-9a-fA-F]{4}$/u.test(input.slice(index + 1, index + 5))) return false;
          index += 5;
          continue;
        }
        if (!escape || !'"\\/bfnrt'.includes(escape)) return false;
        index += 1;
        continue;
      }
      if (!character || character.charCodeAt(0) < 0x20) return false;
      index += 1;
    }
    return false;
  }

  function value(): boolean {
    whitespace();
    const character = input[index];
    if (character === '"') return string();
    if (character === '{') return object();
    if (character === '[') return array();

    const literal = /^(?:true|false|null)/u.exec(input.slice(index));
    if (literal) {
      index += literal[0].length;
      return true;
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u.exec(input.slice(index));
    if (number) {
      index += number[0].length;
      return true;
    }
    return false;
  }

  function array(): boolean {
    index += 1;
    whitespace();
    if (input[index] === ']') {
      index += 1;
      return true;
    }
    while (value()) {
      whitespace();
      if (input[index] === ']') {
        index += 1;
        return true;
      }
      if (input[index] !== ',') return false;
      index += 1;
    }
    return false;
  }

  function object(): boolean {
    index += 1;
    whitespace();
    if (input[index] === '}') {
      index += 1;
      return true;
    }
    while (input[index] === '"') {
      if (!string()) return false;
      whitespace();
      if (input[index] !== ':') return false;
      index += 1;
      if (!value()) return false;
      whitespace();
      if (input[index] === '}') {
        index += 1;
        return true;
      }
      if (input[index] !== ',') return false;
      index += 1;
      whitespace();
    }
    return false;
  }

  try {
    if (!value()) return index;
    whitespace();
    return index === input.length ? undefined : index;
  } catch {
    return index;
  }
}

function jsonPosition(input: string, offset: number): { line: number; column: number } {
  const before = input.slice(0, offset);
  const lines = before.split('\n');
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}

function inspectJsonValue(root: unknown): Failure | undefined {
  let nodes = 0;
  const stack: Array<{ value: unknown; depth: number; root: boolean }> = [
    { value: root, depth: 0, root: true },
  ];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    const { value } = current;
    const collection = Array.isArray(value)
      || (typeof value === 'object' && value !== null);
    const depth = current.depth + (collection ? 1 : 0);

    if (!current.root) {
      nodes += 1;
      if (nodes > MAX_NODES) return failure('输入节点过多（最多 10000 个）');
    }
    if (depth > MAX_DEPTH) return failure('YAML 嵌套不能超过 100 层。');
    if (typeof value === 'number'
      && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) {
      return failure('JSON 包含无法无损转换为 YAML 的值。');
    }

    if (Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index -= 1) {
        stack.push({ value: value[index], depth, root: false });
      }
    } else if (typeof value === 'object' && value !== null) {
      const values = Object.values(value);
      for (let index = values.length - 1; index >= 0; index -= 1) {
        stack.push({ value: values[index], depth, root: false });
      }
    }
  }
  return undefined;
}

function processJsonToYaml(input: string): YamlToolResult {
  let value: unknown;
  try {
    value = JSON.parse(input) as unknown;
  } catch {
    const offset = jsonErrorOffset(input);
    if (offset === undefined) return failure('请输入有效的 JSON。');
    const position = jsonPosition(input, offset);
    return failure('请输入有效的 JSON。', position.line, position.column);
  }

  const valueFailure = inspectJsonValue(value);
  if (valueFailure) return valueFailure;

  try {
    const document = new Document(value, null, { schema: 'core' });
    return {
      kind: 'success',
      output: document.toString({ indent: 2, lineWidth: 0 }),
      warnings: [],
    };
  } catch {
    return failure('JSON 包含无法无损转换为 YAML 的值。');
  }
}

export function processYaml(request: YamlToolRequest): YamlToolResult {
  if (inputTooLarge(request.input)) {
    return failure('输入不能超过 2 MiB（按 UTF-8 计算）。');
  }
  if (request.mode === 'json-to-yaml') return processJsonToYaml(request.input);

  const parsed = parseYaml(request.input);
  if (isFailure(parsed)) return parsed;

  const materialized = materialize(parsed.document);
  if (isFailure(materialized)) return materialized;

  if (request.mode === 'format-yaml') {
    try {
      return {
        kind: 'success',
        output: parsed.document.toString({ indent: 2, lineWidth: 0 }),
        warnings: [],
      };
    } catch {
      return failure('YAML 格式无效。');
    }
  }

  const jsonValue = finiteJsonValue(materialized);
  if (isFailure(jsonValue)) return jsonValue;

  return {
    kind: 'success',
    output: `${JSON.stringify(jsonValue, null, 2)}\n`,
    warnings: parsed.inspection.losesYamlRepresentation ? [LOSSY_YAML_WARNING] : [],
  };
}
