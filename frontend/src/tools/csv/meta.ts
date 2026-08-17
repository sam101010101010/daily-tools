import type { ToolMeta } from '../../registry/types';

export const csvMeta: ToolMeta = {
  id: 'csv',
  name: 'CSV / JSON 转换器',
  description: '在浏览器本地转换 CSV、TSV 与扁平 JSON，预览并导出结果',
  category: '格式化',
  keywords: ['CSV', 'TSV', 'JSON', '表格', '转换', '逗号', '制表符'],
  load: () => import('./CsvTool'),
};
