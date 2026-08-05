import type { ToolMeta } from '../../registry/types';

export const certDecoderMeta: ToolMeta = {
  id: 'cert-decoder',
  name: '证书 / CSR 解码器',
  description: '在浏览器本地解析 X.509 证书或 PKCS#10 CSR，并验证 CSR 签名',
  category: '网络',
  keywords: ['X.509', 'PEM', 'CSR', 'PKCS10', '证书', '公钥', 'SAN', '指纹'],
  load: () => import('./CertDecoderTool'),
};
