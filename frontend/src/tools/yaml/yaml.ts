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

const JSON_CONVERSION = Symbol('json-conversion');

type JsonConversion =
  | { [JSON_CONVERSION]: 'success'; value: unknown }
  | { [JSON_CONVERSION]: 'failure'; error: Failure };

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

function inspectAst(
  root: ParsedNode,
  anchors: Map<string, Node>,
  aliasTargets: WeakMap<Node, Node>,
): AstInspection {
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
    if (isAlias(node)) {
      const target = anchors.get(node.source);
      if (target) aliasTargets.set(node, target);
    }
    if ('anchor' in node && node.anchor) anchors.set(node.anchor, node);
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

function hasAliasCycle(root: Node, aliasTargets: WeakMap<Node, Node>): boolean {
  const active = new Set<Node>();
  const complete = new Set<Node>();

  function visitNode(node: Node): boolean {
    if (isAlias(node)) {
      const target = aliasTargets.get(node);
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

function scalarSignature(value: unknown): string {
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'number:NaN';
    if (Object.is(value, -0)) return 'number:0';
  }
  return `${typeof value}:${String(value)}`;
}

function effectiveKeySignature(
  node: Node,
  aliasTargets: WeakMap<Node, Node>,
  cache: WeakMap<Node, string>,
  active: Set<Node>,
): string | undefined {
  const cached = cache.get(node);
  if (cached !== undefined) return cached;
  if (active.has(node)) return undefined;
  active.add(node);

  let signature: string | undefined;
  if (isAlias(node)) {
    const target = aliasTargets.get(node);
    signature = target ? effectiveKeySignature(target, aliasTargets, cache, active) : undefined;
  } else if (isScalar(node)) {
    signature = JSON.stringify(['scalar', scalarSignature(node.value)]);
  } else if (isSeq(node)) {
    const items: string[] = [];
    let complete = true;
    for (const item of node.items) {
      if (item === null) {
        items.push('null');
        continue;
      }
      const itemSignature = effectiveKeySignature(item as Node, aliasTargets, cache, active);
      if (itemSignature === undefined) {
        complete = false;
        break;
      }
      items.push(itemSignature);
    }
    if (complete) signature = JSON.stringify(['sequence', ...items]);
  } else if (isMap(node)) {
    const entries: string[] = [];
    let complete = true;
    for (const pair of node.items) {
      const keySignature = pair.key === null
        ? 'null'
        : effectiveKeySignature(pair.key as Node, aliasTargets, cache, active);
      const valueSignature = pair.value === null
        ? 'null'
        : effectiveKeySignature(pair.value as Node, aliasTargets, cache, active);
      if (keySignature === undefined || valueSignature === undefined) {
        complete = false;
        break;
      }
      entries.push(JSON.stringify([keySignature, valueSignature]));
    }
    if (complete) {
      entries.sort();
      signature = JSON.stringify(['mapping', ...entries]);
    }
  }

  active.delete(node);
  if (signature !== undefined) cache.set(node, signature);
  return signature;
}

function duplicateEffectiveKey(
  root: Node,
  aliasTargets: WeakMap<Node, Node>,
  lineCounter: LineCounter,
): Failure | undefined {
  const stack: Node[] = [root];
  const cache = new WeakMap<Node, string>();

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) break;

    if (isMap(node)) {
      const signatures = new Set<string>();
      for (const pair of node.items) {
        if (pair.key === null) continue;
        const key = pair.key as Node;
        const signature = effectiveKeySignature(key, aliasTargets, cache, new Set());
        if (signature !== undefined && signatures.has(signature)) {
          const position = lineColumn(lineCounter, key.range?.[0] ?? 0);
          return failure('YAML 包含重复的映射键。', position.line, position.column);
        }
        if (signature !== undefined) signatures.add(signature);
      }
    }

    stack.push(...childrenOf(node));
  }
  return undefined;
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

function convertedJson(value: unknown): JsonConversion {
  return { [JSON_CONVERSION]: 'success', value };
}

function rejectedJson(): JsonConversion {
  return { [JSON_CONVERSION]: 'failure', error: failure(JSON_VALUE_FAILURE) };
}

function finiteJsonValue(value: unknown): JsonConversion {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return convertedJson(value);
  }
  if (typeof value === 'bigint') {
    return value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER)
      ? convertedJson(Number(value))
      : rejectedJson();
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value))
      ? convertedJson(value)
      : rejectedJson();
  }
  if (Array.isArray(value)) {
    const result: unknown[] = [];
    for (const item of value) {
      const converted = finiteJsonValue(item);
      if (converted[JSON_CONVERSION] === 'failure') return converted;
      result.push(converted.value);
    }
    return convertedJson(result);
  }
  if (value instanceof Map) {
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const [key, item] of value) {
      if (typeof key !== 'string') return rejectedJson();
      const converted = finiteJsonValue(item);
      if (converted[JSON_CONVERSION] === 'failure') return converted;
      result[key] = converted.value;
    }
    return convertedJson(result);
  }
  return rejectedJson();
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
  if (document.directives?.yaml.version !== '1.2') {
    return failure('只支持 YAML 1.2 文档。', 1, 1);
  }

  const parserFailure = yamlError(document, lineCounter);
  if (parserFailure) return parserFailure;

  const anchors = new Map<string, Node>();
  const aliasTargets = new WeakMap<Node, Node>();
  const inspection = inspectAst(document.contents, anchors, aliasTargets);
  if (document.comment || document.commentBefore) {
    inspection.losesYamlRepresentation = true;
  }
  if (inspection.failure) {
    if (inspection.tagOffset !== undefined) {
      const position = lineCounter.linePos(inspection.tagOffset);
      return failure(inspection.failure.message, position.line);
    }
    return inspection.failure;
  }
  const duplicateKey = duplicateEffectiveKey(document.contents, aliasTargets, lineCounter);
  if (duplicateKey) return duplicateKey;
  if (hasAliasCycle(document.contents, aliasTargets)) return failure('YAML 不能包含循环引用。');

  return { document, inspection };
}

function jsonErrorOffset(input: string): number | undefined {
  let index = 0;

  function whitespace(): void {
    while (input[index] === ' '
      || input[index] === '\t'
      || input[index] === '\n'
      || input[index] === '\r') {
      index += 1;
    }
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
  if (jsonValue[JSON_CONVERSION] === 'failure') return jsonValue.error;

  return {
    kind: 'success',
    output: `${JSON.stringify(jsonValue.value, null, 2)}\n`,
    warnings: parsed.inspection.losesYamlRepresentation ? [LOSSY_YAML_WARNING] : [],
  };
}
