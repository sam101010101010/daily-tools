import type { ToolMeta } from '../../registry/types';

export const yamlMeta: ToolMeta = {
  id: 'yaml',
  name: 'YAML / JSON 工作台',
  description: '在浏览器本地格式化并转换 YAML 与 JSON，不上传内容',
  category: '格式化',
  keywords: ['YAML', 'JSON', '格式化', '转换', '校验'],
  load: () => import('./YamlTool'),
};
