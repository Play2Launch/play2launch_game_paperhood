import { afterEach, describe, expect, it, vi } from 'vitest';
import { ART_FILES, PaperArt, SCROLL_RATES, scrollOffset, foregroundTop } from './paper-art';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
function mockImages() {
  const requests: FakeImage[] = [];
  class FakeImage {
    naturalWidth = 1024; naturalHeight = 1536; src = '';
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor() { requests.push(this); }
  }
  vi.stubGlobal('Image', FakeImage);
  return requests;
}
describe('paper artwork loading', () => {
  it('draws the moon behind mountains and omits it if occlusion is unavailable', async () => {
    const requests = mockImages(); const art = new PaperArt();
    requests.forEach(img => img.onload!()); await art.ready;
    const calls: unknown[] = [];
    const c = new Proxy({} as CanvasRenderingContext2D, {
      get: (_, name) => name === 'createLinearGradient' ? () => ({ addColorStop() {} }) : (...args: unknown[]) => {
        if (name === 'arc') calls.push('moon');
        if (name === 'drawImage') calls.push(args[0]);
      },
      set: () => true,
    });
    for (const distance of [0, 300, 1000]) {
      calls.length = 0;
      art.background(c, 1000, 540, distance);
      expect(calls.indexOf(art.images.background)).toBeLessThan(calls.indexOf('moon'));
      expect(calls.indexOf('moon')).toBeLessThan(calls.indexOf(art.images.mountains));
      expect(calls.indexOf('moon')).toBeLessThan(calls.indexOf(art.images.clouds));
      expect(calls.indexOf(art.images.clouds)).toBeLessThan(calls.indexOf(art.images.mountains));
      expect(calls.indexOf(art.images.mountains)).toBeLessThan(calls.indexOf(art.images.middle));
      expect(calls.filter(call => call === 'moon')).toHaveLength(1);
    }
    delete art.images.mountains; calls.length = 0;
    expect(art.background(c, 1000, 540, 0)).toBe(true);
    expect(calls).not.toContain('moon');
  });
  it('loads all local assets before reporting ready', async () => {
    const requests = mockImages(); const art = new PaperArt();
    expect(requests).toHaveLength(Object.keys(ART_FILES).length);
    expect(requests.map(r => r.src)).toEqual(Object.values(ART_FILES).map(file => `/art/${file}`));
    requests.forEach(img => img.onload!());
    expect(await art.ready).toBe(true);
    expect(Object.keys(art.images)).toHaveLength(Object.keys(ART_FILES).length);
  });
  it('keeps textured hazards inside the original visual bounds and falls back on failure', async () => {
    const requests = mockImages(); const art = new PaperArt(); requests.forEach(img => img.onload!()); await art.ready;
    const draws: unknown[][] = [];
    const c = { drawImage: (...args: unknown[]) => draws.push(args) } as unknown as CanvasRenderingContext2D;
    expect(art.hazard(c, 100, 200, 40, false)).toBe(true);
    expect(draws[0].slice(-4)).toEqual([74, 152, 52, 48]);
    expect(art.hazard(c, 100, 200, 40, true)).toBe(true);
    expect(draws[1].slice(-4)).toEqual([56, 174, 88, 26]);
    delete art.images.hazards;
    expect(art.hazard(c, 100, 200, 40, false)).toBe(false);
  });
  it('settles failures without registering a broken image', async () => {
    const requests = mockImages(); const art = new PaperArt();
    requests[0].onerror!(); requests.slice(1).forEach(img => img.onload!());
    expect(await art.ready).toBe(false); expect(art.images.body).toBeUndefined();
    expect(art.images.cape).toBeTruthy();
  });
  it('times out stalled images, enabling fallback instead of blocking start forever', async () => {
    vi.useFakeTimers(); const requests = mockImages(); const art = new PaperArt();
    await vi.advanceTimersByTimeAsync(12000);
    expect(await art.ready).toBe(false);
    expect(requests.every(img => img.onload === null && img.onerror === null)).toBe(true);
  });
  it('draws loaded sprites, tiled platforms and panorama with finite coordinates', async () => {
    const requests = mockImages(); const art = new PaperArt(); requests.forEach(img => img.onload!()); await art.ready;
    const draws: unknown[][] = [];
    const c = new Proxy({} as CanvasRenderingContext2D, {
      get: (_, name) => name === 'createLinearGradient' ? () => ({ addColorStop() {} }) : (...args: unknown[]) => { if (name === 'drawImage') draws.push(args); },
      set: () => true,
    });
    for (const distance of [0, 300, 1000]) {
      expect(art.background(c, 366, 520, distance)).toBe(true);
      expect(art.platform(c, -900, 250, 300, 16, false, 366)).toBe(true);
      expect(art.mage(c, distance ? 1 : 0, distance / 9)).toBe(true);
      art.foreground(c, 366, 520, distance, 16, distance / 9);
    }
    expect(draws.length).toBeGreaterThan(70);
    expect(draws.flat().filter(v => typeof v === 'number').every(Number.isFinite)).toBe(true);
    expect(draws.every(args => args[0])).toBe(true);
  });
  it('keeps far and middle behind gameplay, with fastest foreground motion', () => {
    expect(SCROLL_RATES.far).toBeLessThan(SCROLL_RATES.middle);
    expect(SCROLL_RATES.middle).toBeLessThan(1);
    expect(SCROLL_RATES.foreground).toBeGreaterThan(1);
    for (const layer of ['far', 'middle', 'foreground'] as const) {
      expect(scrollOffset(0, 40, layer)).toBe(0);
      expect(scrollOffset(100, 40, layer)).toBe(4000 * SCROLL_RATES[layer]);
    }
    expect(foregroundTop(520)).toBe(520 * .84);
  });
  it('omits a failed middle image while still drawing the far backdrop', async () => {
    const requests = mockImages(); const art = new PaperArt();
    requests.forEach(img => img.src.includes('castle-middle') ? img.onerror!() : img.onload!());
    expect(await art.ready).toBe(false);
    const draws: unknown[] = [];
    const c = new Proxy({} as CanvasRenderingContext2D, {
      get: (_, name) => name === 'createLinearGradient' ? () => ({ addColorStop() {} }) : (...args: unknown[]) => { if (name === 'drawImage') draws.push(args[0]); },
      set: () => true,
    });
    expect(art.background(c, 1000, 540, 200)).toBe(true);
    expect(draws).toContain(art.images.background);
    expect(draws).not.toContain(undefined);
  });
});
