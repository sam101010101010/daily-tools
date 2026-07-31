import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { copyText } from '../../lib/copy';
import { startQrDecode } from './qrDecodeClient';
import QrTool from './QrTool';

vi.mock('../../lib/copy', () => ({ copyText: vi.fn() }));
vi.mock('./qrDecodeClient', () => ({ startQrDecode: vi.fn() }));

const mockedCopyText = vi.mocked(copyText);
const mockedStartQrDecode = vi.mocked(startQrDecode);
type DecodeHandlers = Parameters<typeof startQrDecode>[1];

let putImageData: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  mockedCopyText.mockResolvedValue({ ok: true });
  mockedStartQrDecode.mockImplementation(() => vi.fn());
  putImageData = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    createImageData: (width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
    }),
    putImageData,
  } as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

test('starts with a safe public example and two explicit local-only workflows', () => {
  const storageGet = vi.spyOn(Storage.prototype, 'getItem');
  const storageSet = vi.spyOn(Storage.prototype, 'setItem');

  render(<QrTool />);

  expect(screen.getByRole('heading', { name: '生成' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '识别图片' })).toBeInTheDocument();
  expect(screen.getByLabelText('二维码内容')).toHaveValue('https://example.com');
  expect(screen.getByRole('button', { name: '生成二维码' })).toBeInTheDocument();
  expect(screen.getByLabelText('选择二维码图片')).toHaveAttribute(
    'accept',
    'image/png,image/jpeg,image/webp',
  );
  expect(screen.queryByRole('img', { name: '二维码预览' })).not.toBeInTheDocument();
  expect(screen.getByText('所有内容仅在当前浏览器本地处理，不会上传。')).toBeInTheDocument();
  expect(screen.getByText('识别出的链接不会检查，也不会自动打开。')).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
  expect(storageGet).not.toHaveBeenCalled();
  expect(storageSet).not.toHaveBeenCalled();
});

test('generates the selected ECC matrix only on request and draws an accessible preview', async () => {
  const user = userEvent.setup();
  const storageGet = vi.spyOn(Storage.prototype, 'getItem');
  const storageSet = vi.spyOn(Storage.prototype, 'setItem');
  render(<QrTool />);

  await user.clear(screen.getByLabelText('二维码内容'));
  await user.type(screen.getByLabelText('二维码内容'), 'A'.repeat(25));
  await user.click(screen.getByRole('radio', { name: 'H' }));

  expect(screen.queryByRole('img', { name: '二维码预览' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '生成二维码' }));

  const preview = screen.getByRole('img', { name: '二维码预览' });
  expect(preview).toHaveAttribute('width', '148');
  expect(preview).toHaveAttribute('height', '148');
  expect(putImageData).toHaveBeenCalledOnce();
  expect(screen.getByRole('status')).toHaveTextContent('二维码已生成，纠错级别 H');
  expect(fetch).not.toHaveBeenCalled();
  expect(storageGet).not.toHaveBeenCalled();
  expect(storageSet).not.toHaveBeenCalled();
});

test.each([
  ['', '请输入要生成二维码的文本'],
  ['你'.repeat(1366), '二维码文本不能超过 4 KiB'],
  ['a'.repeat(3000), '该文本无法容纳在所选纠错级别中'],
])('surfaces the generation limit for rejected content', async (text, message) => {
  const user = userEvent.setup();
  render(<QrTool />);

  fireEvent.change(screen.getByLabelText('二维码内容'), { target: { value: text } });
  if (text.startsWith('a')) {
    await user.click(screen.getByRole('radio', { name: 'H' }));
  }
  await user.click(screen.getByRole('button', { name: '生成二维码' }));

  expect(screen.getByRole('alert')).toHaveTextContent(message);
  expect(screen.queryByRole('img', { name: '二维码预览' })).not.toBeInTheDocument();
});

test('downloads the generated preview as fixed-name SVG and PNG files', async () => {
  const user = userEvent.setup();
  const clickedDownloads: Array<{ download: string; href: string }> = [];
  const createObjectUrl = vi.spyOn(URL, 'createObjectURL')
    .mockReturnValueOnce('blob:qr-svg')
    .mockReturnValueOnce('blob:qr-png');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click(
    this: HTMLAnchorElement,
  ) {
    clickedDownloads.push({ download: this.download, href: this.href });
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
    callback(new Blob(['png'], { type: 'image/png' }));
  });
  render(<QrTool />);

  await user.click(screen.getByRole('button', { name: '生成二维码' }));
  await user.click(screen.getByRole('button', { name: '下载 SVG' }));
  await user.click(screen.getByRole('button', { name: '下载 PNG' }));

  expect(createObjectUrl).toHaveBeenCalledTimes(2);
  expect(createObjectUrl.mock.calls[0][0]).toHaveProperty('type', 'image/svg+xml');
  expect(createObjectUrl.mock.calls[1][0]).toHaveProperty('type', 'image/png');
  expect(clickedDownloads).toEqual([
    { download: 'daily-tools-qr-code.svg', href: 'blob:qr-svg' },
    { download: 'daily-tools-qr-code.png', href: 'blob:qr-png' },
  ]);
});

test('reclaims the preview and an outstanding download when unmounted', () => {
  vi.useFakeTimers();
  const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL');
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:outstanding-svg');
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  const { unmount } = render(<QrTool />);

  fireEvent.click(screen.getByRole('button', { name: '生成二维码' }));
  const preview = screen.getByRole('img', { name: '二维码预览' }) as HTMLCanvasElement;
  expect(preview.width).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: '下载 SVG' }));
  expect(revokeObjectUrl).not.toHaveBeenCalled();

  unmount();

  expect(preview).toMatchObject({ width: 0, height: 0 });
  expect(revokeObjectUrl).toHaveBeenCalledWith('blob:outstanding-svg');
});

test('does not create a PNG download when canvas encoding completes after unmount', () => {
  let completePng!: BlobCallback;
  const createObjectUrl = vi.spyOn(URL, 'createObjectURL');
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
    completePng = callback;
  });
  const { unmount } = render(<QrTool />);

  fireEvent.click(screen.getByRole('button', { name: '生成二维码' }));
  fireEvent.click(screen.getByRole('button', { name: '下载 PNG' }));
  unmount();
  act(() => completePng(new Blob(['late png'], { type: 'image/png' })));

  expect(createObjectUrl).not.toHaveBeenCalled();
});

test('keeps late-safety guards active after the React Strict Mode effect rehearsal', () => {
  const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:strict-png');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
    callback(new Blob(['png'], { type: 'image/png' }));
  });
  render(<StrictMode><QrTool /></StrictMode>);

  fireEvent.click(screen.getByRole('button', { name: '生成二维码' }));
  fireEvent.click(screen.getByRole('button', { name: '下载 PNG' }));

  expect(createObjectUrl).toHaveBeenCalledOnce();
});

test('starts local image recognition with an accessible pending state and no fetch or storage', async () => {
  const user = userEvent.setup();
  const storageGet = vi.spyOn(Storage.prototype, 'getItem');
  const storageSet = vi.spyOn(Storage.prototype, 'setItem');
  render(<QrTool />);
  const file = new File(['image bytes'], 'code.png', { type: 'image/png' });

  await user.upload(screen.getByLabelText('选择二维码图片'), file);

  expect(mockedStartQrDecode).toHaveBeenCalledWith(file, expect.any(Object));
  expect(screen.getByRole('status')).toHaveTextContent('正在本地识别二维码');
  expect(screen.getByRole('progressbar', { name: '二维码识别进度' })).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
  expect(storageGet).not.toHaveBeenCalled();
  expect(storageSet).not.toHaveBeenCalled();
});

test.each([
  ['not-found', '未在图片中识别到二维码'],
  ['corrupt', '图片无法读取，请选择有效的 PNG、JPEG 或 WebP 文件'],
  ['over-limit', '图片文件不能超过 10 MiB'],
] as const)('renders the distinct %s recognition error', async (kind, message) => {
  const user = userEvent.setup();
  mockedStartQrDecode.mockImplementationOnce((_file, handlers) => {
    if (kind === 'not-found') handlers.onNotFound(message);
    else handlers.onError(message);
    return vi.fn();
  });
  render(<QrTool />);

  await user.upload(
    screen.getByLabelText('选择二维码图片'),
    new File(['image bytes'], `${kind}.png`, { type: 'image/png' }),
  );

  expect(screen.getByRole('alert')).toHaveTextContent(message);
  expect(screen.queryByRole('progressbar', { name: '二维码识别进度' }))
    .not.toBeInTheDocument();
  expect(screen.queryByLabelText('识别结果')).not.toBeInTheDocument();
});

test('renders and copies a decoded result with accessible copy feedback', async () => {
  const user = userEvent.setup();
  render(<QrTool />);
  await user.upload(
    screen.getByLabelText('选择二维码图片'),
    new File(['image bytes'], 'result.png', { type: 'image/png' }),
  );
  const handlers = mockedStartQrDecode.mock.calls[0][1];

  act(() => handlers.onSuccess('decoded plain text'));
  expect(screen.getByLabelText('识别结果')).toHaveTextContent('decoded plain text');

  await user.click(screen.getByRole('button', { name: '复制识别结果' }));

  expect(mockedCopyText).toHaveBeenCalledWith('decoded plain text');
  expect(screen.getByRole('status')).toHaveTextContent('已复制');
});

test('renders clipboard failures through the shared error convention', async () => {
  const user = userEvent.setup();
  mockedCopyText.mockResolvedValueOnce({ ok: false, message: '复制失败，请手动复制。' });
  render(<QrTool />);
  await user.upload(
    screen.getByLabelText('选择二维码图片'),
    new File(['image bytes'], 'copy-error.png', { type: 'image/png' }),
  );
  act(() => mockedStartQrDecode.mock.calls[0][1].onSuccess('copy me'));

  await user.click(screen.getByRole('button', { name: '复制识别结果' }));

  expect(screen.getByRole('alert')).toHaveTextContent('复制失败，请手动复制。');
  expect(screen.queryByText('已复制')).not.toBeInTheDocument();
});

test.each([
  'https://attacker.invalid/track?secret=1',
  '<img src="https://attacker.invalid/track" onerror="alert(1)">',
])('keeps decoded content inert React text: %s', async (decoded) => {
  const user = userEvent.setup();
  render(<QrTool />);
  await user.upload(
    screen.getByLabelText('选择二维码图片'),
    new File(['image bytes'], 'untrusted.png', { type: 'image/png' }),
  );

  act(() => mockedStartQrDecode.mock.calls[0][1].onSuccess(decoded));

  const result = screen.getByLabelText('识别结果');
  expect(result).toHaveTextContent(decoded);
  expect(result.querySelector('a')).toBeNull();
  expect(result.querySelector('img')).toBeNull();
  expect(document.querySelector('a')).toBeNull();
  expect(document.querySelector('img')).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

test('cancels replaced file work and prevents its late result from overwriting the new job', async () => {
  const user = userEvent.setup();
  const oldCancel = vi.fn();
  const newCancel = vi.fn();
  mockedStartQrDecode
    .mockReturnValueOnce(oldCancel)
    .mockReturnValueOnce(newCancel);
  render(<QrTool />);

  await user.upload(
    screen.getByLabelText('选择二维码图片'),
    new File(['old'], 'old.png', { type: 'image/png' }),
  );
  const oldHandlers = mockedStartQrDecode.mock.calls[0][1];
  await user.upload(
    screen.getByLabelText('选择二维码图片'),
    new File(['new'], 'new.png', { type: 'image/png' }),
  );
  const newHandlers = mockedStartQrDecode.mock.calls[1][1];

  expect(oldCancel).toHaveBeenCalledOnce();
  act(() => oldHandlers.onSuccess('stale result'));
  expect(screen.queryByText('stale result')).not.toBeInTheDocument();
  act(() => newHandlers.onSuccess('current result'));
  expect(screen.getByLabelText('识别结果')).toHaveTextContent('current result');
  expect(newCancel).not.toHaveBeenCalled();
});

test('cancels recognition on unmount and ignores every late callback', async () => {
  const user = userEvent.setup();
  const cancel = vi.fn();
  mockedStartQrDecode.mockReturnValueOnce(cancel);
  const { unmount } = render(<QrTool />);
  await user.upload(
    screen.getByLabelText('选择二维码图片'),
    new File(['pending'], 'pending.png', { type: 'image/png' }),
  );
  const handlers: DecodeHandlers = mockedStartQrDecode.mock.calls[0][1];

  unmount();
  act(() => {
    handlers.onSuccess('late success');
    handlers.onNotFound('late not found');
    handlers.onError('late error');
  });

  expect(cancel).toHaveBeenCalledOnce();
  expect(screen.queryByLabelText('识别结果')).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
