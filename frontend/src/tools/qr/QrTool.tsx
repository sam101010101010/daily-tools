import { useEffect, useRef, useState } from 'react';
import { ErrorView } from '../../components/ErrorView';
import { copyText } from '../../lib/copy';
import {
  QR_ECC_LEVELS,
  QrGenerationError,
  createPngDownload,
  createQrPngSource,
  createSvgDownload,
  generateQr,
  type GeneratedQr,
  type QrDownload,
  type QrEcc,
} from './qr';
import { startQrDecode } from './qrDecodeClient';

const PUBLIC_EXAMPLE = 'https://example.com';

export default function QrTool() {
  const [text, setText] = useState(PUBLIC_EXAMPLE);
  const [ecc, setEcc] = useState<QrEcc>('M');
  const [generated, setGenerated] = useState<GeneratedQr>();
  const [generationError, setGenerationError] = useState('');
  const [decodeBusy, setDecodeBusy] = useState(false);
  const [decodedText, setDecodedText] = useState<string>();
  const [decodeError, setDecodeError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [copyError, setCopyError] = useState('');
  const previewRef = useRef<HTMLCanvasElement>(null);
  const mountedRef = useRef(true);
  const generationVersionRef = useRef(0);
  const decodeVersionRef = useRef(0);
  const cancelDecodeRef = useRef<(() => void) | undefined>(undefined);
  const activeDownloadsRef = useRef(new Set<QrDownload>());
  const downloadTimersRef = useRef(new Map<QrDownload, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    mountedRef.current = true;
    const activeDownloads = activeDownloadsRef.current;
    const downloadTimers = downloadTimersRef.current;
    return () => {
      mountedRef.current = false;
      generationVersionRef.current += 1;
      decodeVersionRef.current += 1;
      cancelDecodeRef.current?.();
      cancelDecodeRef.current = undefined;
      downloadTimers.forEach(timer => clearTimeout(timer));
      downloadTimers.clear();
      activeDownloads.forEach(download => download.revoke());
      activeDownloads.clear();
    };
  }, []);

  useEffect(() => {
    const canvas = previewRef.current;
    if (!generated || !canvas) return;

    const source = createQrPngSource(generated);
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext('2d');
    if (!context) return;
    const imageData = context.createImageData(source.width, source.height);
    imageData.data.set(source.rgba);
    context.putImageData(imageData, 0, 0);

    return () => {
      canvas.width = 0;
      canvas.height = 0;
    };
  }, [generated]);

  function generate() {
    generationVersionRef.current += 1;
    try {
      setGenerated(generateQr(text, ecc));
      setGenerationError('');
    } catch (error) {
      setGenerated(undefined);
      setGenerationError(
        error instanceof QrGenerationError
          ? error.message
          : '二维码生成失败，请重试。',
      );
    }
  }

  function releaseDownload(download: QrDownload) {
    const timer = downloadTimersRef.current.get(download);
    if (timer !== undefined) clearTimeout(timer);
    downloadTimersRef.current.delete(download);
    activeDownloadsRef.current.delete(download);
    download.revoke();
  }

  function startDownload(download: QrDownload) {
    activeDownloadsRef.current.add(download);
    const anchor = document.createElement('a');
    anchor.href = download.url;
    anchor.download = download.filename;
    anchor.click();
    const timer = setTimeout(() => releaseDownload(download), 0);
    downloadTimersRef.current.set(download, timer);
  }

  function downloadSvg() {
    if (generated) startDownload(createSvgDownload(generated));
  }

  function downloadPng() {
    const canvas = previewRef.current;
    if (!canvas) return;
    const version = generationVersionRef.current;
    canvas.toBlob(blob => {
      if (!blob || !mountedRef.current || version !== generationVersionRef.current) return;
      startDownload(createPngDownload(blob));
    }, 'image/png');
  }

  function selectDecodeFile(file: File | undefined) {
    decodeVersionRef.current += 1;
    cancelDecodeRef.current?.();
    cancelDecodeRef.current = undefined;
    setDecodeBusy(false);
    setDecodedText(undefined);
    setDecodeError('');
    setCopyStatus('');
    setCopyError('');
    if (!file) return;

    const version = decodeVersionRef.current;
    let completedSynchronously = false;
    setDecodeBusy(true);
    const finish = (deliver: () => void) => {
      completedSynchronously = true;
      if (decodeVersionRef.current !== version) return;
      cancelDecodeRef.current = undefined;
      setDecodeBusy(false);
      deliver();
    };
    const cancel = startQrDecode(file, {
      onSuccess: result => finish(() => setDecodedText(result)),
      onNotFound: message => finish(() => setDecodeError(message)),
      onError: message => finish(() => setDecodeError(message)),
    });
    if (!completedSynchronously && decodeVersionRef.current === version) {
      cancelDecodeRef.current = cancel;
    }
  }

  async function copyDecodedText() {
    if (decodedText === undefined) return;
    const version = decodeVersionRef.current;
    setCopyStatus('');
    setCopyError('');
    const result = await copyText(decodedText);
    if (!mountedRef.current || decodeVersionRef.current !== version) return;
    if (result.ok) setCopyStatus('已复制');
    else setCopyError(result.message);
  }

  return (
    <div className="qr">
      <p className="qr__privacy">所有内容仅在当前浏览器本地处理，不会上传。</p>
      <p className="qr__safety">识别出的链接不会检查，也不会自动打开。</p>

      <section className="qr__section" aria-labelledby="qr-generate-heading">
        <h3 id="qr-generate-heading">生成</h3>
        <label htmlFor="qr-text">二维码内容</label>
        <textarea
          id="qr-text"
          aria-label="二维码内容"
          value={text}
          onChange={event => setText(event.target.value)}
        />
        <fieldset className="qr__ecc">
          <legend>纠错级别</legend>
          {QR_ECC_LEVELS.map(level => (
            <label key={level}>
              <input
                type="radio"
                name="qr-ecc"
                aria-label={level}
                value={level}
                checked={ecc === level}
                onChange={() => setEcc(level)}
              />
              {level}
            </label>
          ))}
        </fieldset>
        <button type="button" onClick={generate}>生成二维码</button>
        {generationError && <ErrorView message={generationError} />}
        {generated && (
          <div className="qr__preview">
            <canvas ref={previewRef} role="img" aria-label="二维码预览" />
            <p role="status" aria-live="polite">
              二维码已生成，纠错级别 {generated.ecc}
            </p>
            <div className="qr__download-actions">
              <button type="button" onClick={downloadSvg}>下载 SVG</button>
              <button type="button" onClick={downloadPng}>下载 PNG</button>
            </div>
          </div>
        )}
      </section>

      <section className="qr__section" aria-labelledby="qr-decode-heading">
        <h3 id="qr-decode-heading">识别图片</h3>
        <label htmlFor="qr-file">选择二维码图片</label>
        <input
          id="qr-file"
          aria-label="选择二维码图片"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={event => selectDecodeFile(event.target.files?.[0])}
        />
        {decodeBusy && (
          <div className="qr__decode-progress" role="status" aria-live="polite">
            <progress aria-label="二维码识别进度" />
            <span>正在本地识别二维码…</span>
          </div>
        )}
        {decodeError && <ErrorView message={decodeError} />}
        {decodedText !== undefined && (
          <div className="qr__decode-result">
            <pre aria-label="识别结果">{decodedText}</pre>
            <button type="button" onClick={() => void copyDecodedText()}>
              复制识别结果
            </button>
            {copyStatus && (
              <span className="qr__copy-status" role="status" aria-live="polite">
                {copyStatus}
              </span>
            )}
            {copyError && <ErrorView message={copyError} />}
          </div>
        )}
      </section>
    </div>
  );
}
