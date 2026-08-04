import { useRef, useState } from 'react';
import { Certificate, CertificationRequest } from 'pkijs';
import { ErrorView } from '../../components/ErrorView';
import { copyText } from '../../lib/copy';
import { parsePkiDer } from './asn1';
import { parseSinglePem } from './pem';
import * as reportMappers from './report';
import type {
  AlgorithmReport,
  CertificateReport,
  CertificationRequestReport,
  DistinguishedNameItem,
  SubjectAlternativeName,
} from './report';

const PUBLIC_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIE6zCCA9OgAwIBAgIQECAwQFBgcICQoLDA0ODwEDANBgkqhkiG9w0BAQsFADCB
mzELMAkGA1UEBhMCVVMxGDAWBgNVBAoMD0RhaWx5IFRvb2xzIExhYjEdMBsGA1UE
CwwUQ2VydGlmaWNhdGUgRml4dHVyZXMxGTAXBgNVBAMMEHJzYS5leGFtcGxlLnRl
c3QxHzAdBgkqhkiG9w0BCQEWEG9wc0BleGFtcGxlLnRlc3QxFzAVBgQqAwQFDA1S
ZXNlYXJjaCBVbml0MCAXDTI2MDgwNDA2Mzg0OFoYDzIwNTMxMjIwMDYzODQ4WjCB
mzELMAkGA1UEBhMCVVMxGDAWBgNVBAoMD0RhaWx5IFRvb2xzIExhYjEdMBsGA1UE
CwwUQ2VydGlmaWNhdGUgRml4dHVyZXMxGTAXBgNVBAMMEHJzYS5leGFtcGxlLnRl
c3QxHzAdBgkqhkiG9w0BCQEWEG9wc0BleGFtcGxlLnRlc3QxFzAVBgQqAwQFDA1S
ZXNlYXJjaCBVbml0MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA6tBJ
YhxErjK50vtXXi/O74I6CEn5jMz9SFyVIUqEa6/f8E1Uk7LnvIvlUKH0O9pJfeB5
KQhboHmbZjQiZzzjPfJFUKvM4eeBKXWpnEdxHUw+4MTlBXlWv4cjdRy3+A3WGwug
+7DDRDx6iJxSkOb8jhMebRNvI9HDY3wmOBcGmwmdvHxEFs4XiG7Ng3k1xBvTe5H/
6tvRTp6Xi52HXLPRRLmc6+S3Bu1/KjtYBFiQmrUBN3p+AmGDebjcHn/S+SND+yOM
mYQZMmsn+v553PTPqEHDRgsYTJBjun5nNusUemxtbg0gAjXCZ357foEjXWen36rQ
dH0L8WA385D7ijrvuQIDAQABo4IBJTCCASEwEgYDVR0TAQH/BAgwBgEB/wIBADAO
BgNVHQ8BAf8EBAMCAYYwJwYDVR0lBCAwHgYIKwYBBQUHAwEGCCsGAQUFBwMCBggr
BgEFBQcDAzCBiAYDVR0RBIGAMH6CEHJzYS5leGFtcGxlLnRlc3SHBMAAAiqBFXNl
Y3VyaXR5QGV4YW1wbGUudGVzdIYkaHR0cHM6Ly9yc2EuZXhhbXBsZS50ZXN0L2Nl
cnRpZmljYXRloCcGCCsGAQUFBwgFoBsMGWZpeHR1cmUtdXNlckBleGFtcGxlLnRl
c3QwKAYEKgMEYwEB/wQdDBtTeW50aGV0aWMgdW5rbm93biBleHRlbnNpb24wHQYD
VR0OBBYEFJG3W9pNoCNY9EkGlbUfVBi2caPfMA0GCSqGSIb3DQEBCwUAA4IBAQDZ
AAHC7NgSM5/vZu8encXLeQdIS74taBnr5NNtO05qZZE85qD8ypq6awk6o1ehm2Lj
+W68B7c6CarnevxV/Eqd/KaqEecMEasqtTM+VEJp3HjOulovibyL+j70TxG6amTg
BQHJLdukCnyx250QnsXR00EMJJu4mJlHvwayxOWmq8EPZjglJk7p1fAr+C6+xlYc
0c0sk7RVErlLFtILJ6QW+0dDREbIO5XAPjWQU/L7+8gTJvFQki9hnuNOhl7eomZu
+081jBBzC324f2iuoy/8EOCEoNPnMFHN7GPqODU888DWBPqCoVoADCBcD93H7mP+
XgTX5eFksL6fUTKbLH2C
-----END CERTIFICATE-----`;

type PkiReport = CertificateReport | CertificationRequestReport;

const VALIDITY_LABELS: Readonly<Record<CertificateReport['validity']['state'], string>> = {
  'not-yet-valid': '尚未生效（相对本地时钟）',
  valid: '位于有效期内（相对本地时钟）',
  expired: '已超过有效期（相对本地时钟）',
};

const SAN_TYPE_LABELS: Readonly<Record<SubjectAlternativeName['type'], string>> = {
  dns: 'DNS',
  email: 'Email',
  uri: 'URI',
  ip: 'IP',
  unknown: '未知',
};

function AlgorithmValue({ algorithm }: { algorithm: AlgorithmReport }) {
  return <>{algorithm.name}（<span className="cert-decoder__mono">{algorithm.oid}</span>）</>;
}

function DistinguishedNameTable({
  label,
  values,
}: {
  label: string;
  values: readonly DistinguishedNameItem[];
}) {
  return (
    <div className="cert-decoder__table-wrap" role="region" aria-label={`${label} 表格滚动区域`} tabIndex={0}>
      <table className="cert-decoder__table cert-decoder__table--dn" aria-label={label}>
        <thead><tr><th scope="col">属性</th><th scope="col">OID</th><th scope="col">值</th></tr></thead>
        <tbody>
          {values.map((item, index) => (
            <tr key={`${item.oid}-${index}`}>
              <td>{item.name}</td><td className="cert-decoder__mono">{item.oid}</td><td>{item.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SanTable({ label, values }: { label: string; values: readonly SubjectAlternativeName[] }) {
  return (
    <div className="cert-decoder__table-wrap" role="region" aria-label={`${label} 表格滚动区域`} tabIndex={0}>
      <table className="cert-decoder__table cert-decoder__table--san" aria-label={label}>
        <thead><tr><th scope="col">类型</th><th scope="col">值</th></tr></thead>
        <tbody>
          {values.map((item, index) => (
            <tr key={`${item.type}-${index}`}>
              <td>{SAN_TYPE_LABELS[item.type]}{item.type === 'unknown' ? `（tag ${item.tag}）` : ''}</td>
              <td className="cert-decoder__mono">{item.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Fingerprint({ value }: { value: string }) {
  return <code className="cert-decoder__mono">{value}</code>;
}

function CertificateExtensions({ report }: { report: CertificateReport }) {
  const { basicConstraints, keyUsage, extendedKeyUsage, unrecognized } = report.extensions;
  return (
    <details className="cert-decoder__extensions" open>
      <summary>证书扩展</summary>
      <dl className="cert-decoder__extension-list">
        <div className="cert-decoder__field">
          <dt>Basic Constraints</dt>
          <dd className="cert-decoder__extension-value">{basicConstraints
            ? `${basicConstraints.oid}；critical：${basicConstraints.critical ? '是' : '否'}；CA：${basicConstraints.ca ? '是' : '否'}；路径长度：${basicConstraints.pathLength ?? '未限制'}`
            : '未包含'}</dd>
        </div>
        <div className="cert-decoder__field">
          <dt>Key Usage</dt>
          <dd className="cert-decoder__extension-value">{keyUsage
            ? `${keyUsage.oid}；critical：${keyUsage.critical ? '是' : '否'}；${keyUsage.usages.join('、') || '无已知用途'}`
            : '未包含'}</dd>
        </div>
        <div className="cert-decoder__field">
          <dt>Extended Key Usage</dt>
          <dd className="cert-decoder__extension-value">{extendedKeyUsage
            ? `${extendedKeyUsage.oid}；critical：${extendedKeyUsage.critical ? '是' : '否'}；${extendedKeyUsage.purposes.map(purpose => `${purpose.name}（${purpose.oid}）`).join('、') || '无已知用途'}`
            : '未包含'}</dd>
        </div>
      </dl>
      {unrecognized.length > 0 ? (
        <div className="cert-decoder__table-wrap" role="region" aria-label="未识别的证书扩展 表格滚动区域" tabIndex={0}>
          <table className="cert-decoder__table cert-decoder__table--extensions" aria-label="未识别的证书扩展">
            <thead><tr><th scope="col">OID</th><th scope="col">Critical</th><th scope="col">值</th></tr></thead>
            <tbody>{unrecognized.map((extension, index) => (
              <tr key={`${extension.oid}-${index}`}>
                <td className="cert-decoder__mono">{extension.oid}</td><td>{extension.critical ? '是' : '否'}</td><td className="cert-decoder__extension-value">{extension.value}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <p className="cert-decoder__empty">没有未识别的扩展。</p>}
    </details>
  );
}

function CertificateReportView({ report }: { report: CertificateReport }) {
  return (
    <section className="cert-decoder__report cert-decoder__report--certificate" role="region" aria-label="证书报告">
      <h3>证书报告</h3>
      <dl className="cert-decoder__summary">
        <div className="cert-decoder__field"><dt>版本</dt><dd>{report.version}</dd></div>
        <div className="cert-decoder__field"><dt>序列号</dt><dd><code className="cert-decoder__mono">{report.serialNumber}</code></dd></div>
        <div className="cert-decoder__field"><dt>生效时间</dt><dd><time dateTime={report.validity.notBefore}>{report.validity.notBefore}</time></dd></div>
        <div className="cert-decoder__field"><dt>到期时间</dt><dd><time dateTime={report.validity.notAfter}>{report.validity.notAfter}</time></dd></div>
        <div className="cert-decoder__field"><dt>日期状态</dt><dd>{VALIDITY_LABELS[report.validity.state]}</dd></div>
        <div className="cert-decoder__field"><dt>公钥算法</dt><dd><AlgorithmValue algorithm={report.publicKeyAlgorithm} /></dd></div>
        <div className="cert-decoder__field"><dt>签名算法</dt><dd><AlgorithmValue algorithm={report.signatureAlgorithm} /></dd></div>
        <div className="cert-decoder__field"><dt>SHA-256 指纹</dt><dd><Fingerprint value={report.fingerprintSha256} /></dd></div>
      </dl>
      <h4>主题</h4>
      <DistinguishedNameTable label="主题 DN" values={report.subject} />
      <h4>颁发者</h4>
      <DistinguishedNameTable label="颁发者 DN" values={report.issuer} />
      <h4>主题备用名称</h4>
      {report.subjectAlternativeNames.length > 0
        ? <SanTable label="主题备用名称" values={report.subjectAlternativeNames} />
        : <p className="cert-decoder__empty">未包含</p>}
      <CertificateExtensions report={report} />
    </section>
  );
}

function csrSignatureLabel(report: CertificationRequestReport): string {
  if (report.signature.status === 'valid') return '签名有效';
  if (report.signature.status === 'invalid') return '签名无效';
  return '当前浏览器不支持验证此签名算法';
}

function CertificationRequestReportView({ report }: { report: CertificationRequestReport }) {
  return (
    <section className="cert-decoder__report cert-decoder__report--csr" role="region" aria-label="CSR 报告">
      <h3>CSR 报告</h3>
      <dl className="cert-decoder__summary">
        <div className="cert-decoder__field"><dt>公钥算法</dt><dd><AlgorithmValue algorithm={report.publicKeyAlgorithm} /></dd></div>
        <div className="cert-decoder__field"><dt>签名算法</dt><dd><AlgorithmValue algorithm={report.signatureAlgorithm} /></dd></div>
        <div className="cert-decoder__field"><dt>SHA-256 指纹</dt><dd><Fingerprint value={report.fingerprintSha256} /></dd></div>
        <div className="cert-decoder__field"><dt>CSR 签名状态</dt><dd>{csrSignatureLabel(report)}</dd></div>
      </dl>
      <h4>请求主题</h4>
      <DistinguishedNameTable label="请求主题 DN" values={report.subject} />
      <h4>请求的主题备用名称</h4>
      {report.subjectAlternativeNames.status === 'present'
        ? <SanTable label="请求的主题备用名称" values={report.subjectAlternativeNames.values} />
        : <dl className="cert-decoder__summary"><div className="cert-decoder__field"><dt>请求的主题备用名称</dt><dd>{report.subjectAlternativeNames.label}</dd></div></dl>}
    </section>
  );
}

function ReportActions({
  report,
  onCopy,
}: {
  report: PkiReport;
  onCopy: (value: string, successMessage: string) => void;
}) {
  return (
    <div className="cert-decoder__report-actions">
      <button type="button" onClick={() => onCopy(report.fingerprintSha256, 'SHA-256 指纹已复制')}>
        复制 SHA-256 指纹
      </button>
      <button type="button" onClick={() => onCopy(JSON.stringify(report, null, 2), '完整报告已复制')}>
        复制完整报告
      </button>
    </div>
  );
}

export default function CertDecoderTool() {
  const [input, setInput] = useState(PUBLIC_CERTIFICATE);
  const [report, setReport] = useState<PkiReport>();
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [copyError, setCopyError] = useState('');
  const operationSequence = useRef(0);

  async function decode() {
    const operation = ++operationSequence.current;
    setReport(undefined);
    setError('');
    setCopyStatus('');
    setCopyError('');

    const pemResult = parseSinglePem(input);
    if (!pemResult.ok) {
      setError(pemResult.error.message);
      return;
    }

    const pkiResult = parsePkiDer(pemResult.value.der, pemResult.value.label);
    if (!pkiResult.ok) {
      setError(pkiResult.error.message);
      return;
    }

    try {
      let nextReport: PkiReport;
      if (pemResult.value.label === 'CERTIFICATE') {
        if (!(pkiResult.value instanceof Certificate)) throw new Error('unexpected PKI type');
        nextReport = await reportMappers.mapCertificate(
          pkiResult.value,
          pemResult.value.der,
          new Date(),
        );
      } else {
        if (!(pkiResult.value instanceof CertificationRequest)) throw new Error('unexpected PKI type');
        nextReport = await reportMappers.mapCertificationRequest(
          pkiResult.value,
          pemResult.value.der,
        );
      }
      if (operation === operationSequence.current) setReport(nextReport);
    } catch {
      if (operation === operationSequence.current) {
        setError('解码失败，请确认内容是受支持的证书或 CSR。');
      }
    }
  }

  function changeInput(value: string) {
    operationSequence.current += 1;
    setInput(value);
    setReport(undefined);
    setError('');
    setCopyStatus('');
    setCopyError('');
  }

  function reset() {
    operationSequence.current += 1;
    setInput(PUBLIC_CERTIFICATE);
    setReport(undefined);
    setError('');
    setCopyStatus('');
    setCopyError('');
  }

  async function copy(value: string, successMessage: string) {
    setCopyStatus('');
    setCopyError('');
    const result = await copyText(value);
    if (result.ok) setCopyStatus(successMessage);
    else setCopyError(result.message);
  }

  return (
    <div className="cert-decoder">
      <aside className="cert-decoder__notice" aria-label="处理与验证范围说明">
        <p><strong>所有内容仅在当前浏览器本地处理，不会上传。</strong></p>
        <p>证书解析和日期状态不代表证书链信任、主机名匹配或吊销验证。</p>
        <p>CSR 签名有效仅证明签名时持有请求内公钥对应的私钥，不证明身份、信任或已签发。</p>
      </aside>
      <label className="cert-decoder__label" htmlFor="cert-decoder-input">PEM 证书或 CSR</label>
      <textarea
        className="cert-decoder__editor"
        id="cert-decoder-input"
        value={input}
        onChange={event => changeInput(event.target.value)}
        rows={14}
        spellCheck={false}
      />
      <div className="cert-decoder__decode-actions">
        <button type="button" onClick={() => void decode()}>解码</button>
        <button type="button" onClick={reset}>重置</button>
      </div>
      {error && <ErrorView message={error} />}
      {report && (
        <>
          <ReportActions report={report} onCopy={(value, message) => void copy(value, message)} />
          {report.kind === 'certificate'
            ? <CertificateReportView report={report} />
            : <CertificationRequestReportView report={report} />}
        </>
      )}
      {copyStatus && <p className="cert-decoder__status" role="status" aria-live="polite">{copyStatus}</p>}
      {copyError && <ErrorView message={copyError} />}
    </div>
  );
}
