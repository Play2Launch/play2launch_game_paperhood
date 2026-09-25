import { afterEach, expect, it, vi } from 'vitest';
import { ART_FILES, PaperArt } from './paper-art';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

function mockImages() {
  const images: MockImage[] = [];
  class MockImage {
    naturalWidth = 100;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    src = '';
    decode = vi.fn(() => Promise.resolve());
    constructor() { images.push(this); }
  }
  vi.stubGlobal('Image', MockImage);
  return images;
}

it('counts decoded assets and waits for every image before declaring readiness', async () => {
  const images = mockImages();
  const art = new PaperArt();
  expect(art.total).toBe(Object.keys(ART_FILES).length);
  expect(art.settled).toBe(0);
  images[0].onload!();
  expect(art.settled).toBe(0); // Download alone is not ready until decode completes.
  await Promise.resolve();
  expect(art.loaded).toBe(1);
  expect(art.settled).toBe(1);
  for (const image of images.slice(1)) image.onload!();
  expect(await art.ready).toBe(true);
  expect(art.loaded).toBe(art.total);
  expect(art.settled).toBe(art.total);
});

it('settles failures and timeouts without hanging or replacing fallback art later', async () => {
  vi.useFakeTimers();
  const images = mockImages();
  const art = new PaperArt();
  images[0].onerror!();
  const lateLoad = images[1].onload!;
  await vi.advanceTimersByTimeAsync(12000);
  expect(await art.ready).toBe(false);
  expect(art.settled).toBe(art.total);
  lateLoad();
  await Promise.resolve();
  expect(art.loaded).toBe(0);
  expect(art.images).toEqual({});
  expect(art.settled).toBe(art.total);
});
