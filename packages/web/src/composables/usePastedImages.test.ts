// @vitest-environment happy-dom
import { MAX_IMAGE_BYTES, MAX_IMAGES } from '@drums/protocol';
import { describe, expect, it, vi } from 'vitest';
import { usePastedImages } from './usePastedImages';

const png = (name = 'a.png', size = 3) => new File([new Uint8Array(size)], name, { type: 'image/png' });

const pasteEvent = (files: File[]) =>
  ({ clipboardData: { files }, preventDefault: vi.fn() }) as unknown as ClipboardEvent;

const settled = (images: { value: unknown[] }, count: number) => vi.waitFor(() => expect(images.value).toHaveLength(count));

describe('usePastedImages', () => {
  it('holds one paste of many files to the limit', async () => {
    const report = vi.fn();
    const { images, paste } = usePastedImages(report);
    paste(pasteEvent(Array.from({ length: MAX_IMAGES + 3 }, () => png())));
    await settled(images, MAX_IMAGES);
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0]![0]).toContain(`${MAX_IMAGES} images`);
  });

  it('skips a file over the size limit and keeps the rest', async () => {
    const report = vi.fn();
    const { images, paste } = usePastedImages(report);
    const big = png('big.png');
    Object.defineProperty(big, 'size', { value: MAX_IMAGE_BYTES + 1 });
    paste(pasteEvent([big, png()]));
    await settled(images, 1);
    expect(report.mock.calls[0]![0]).toContain('big.png');
  });

  it('leaves a paste with no images to the textarea', () => {
    const { paste } = usePastedImages(vi.fn());
    const event = pasteEvent([new File(['x'], 'a.svg', { type: 'image/svg+xml' })]);
    paste(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('hands over base64 without the data URL prefix, and can put it back', async () => {
    const { images, paste, take } = usePastedImages(vi.fn());
    paste(pasteEvent([png()]));
    await settled(images, 1);
    const { upload, restore } = take();
    expect(images.value).toHaveLength(0);
    expect(upload[0]).toEqual({ type: 'image/png', data: 'AAAA' });
    restore();
    expect(images.value).toHaveLength(1);
  });
});
