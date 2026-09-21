import { afterEach, describe, expect, it, vi } from 'vitest';
import { framing, Paper2D, platformPlants } from './paper2d';
import { Run } from './simulation';
import { platformDepth } from './paper-art';

afterEach(() => vi.unstubAllGlobals());
function renderer() {
  const commands: unknown[][] = [];
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get: (_, name) => name === 'createLinearGradient' ? () => ({ addColorStop() {} }) : (...args: unknown[]) => commands.push([name, ...args]),
    set: () => true,
  });
  const canvas = { getContext: () => ctx, setAttribute() {}, style: {}, width: 0, height: 0 };
  vi.stubGlobal('document', { createElement: () => canvas });
  vi.stubGlobal('devicePixelRatio', 3);
  return { art: new Paper2D(false), commands, canvas };
}
describe('2D presentation', () => {
  it.each([[320, 640], [390, 844], [430, 932], [1256, 540]])('extends ground below portrait and landscape frames at %i × %i', (w, h) => {
    const { scale, baseline } = framing(w, h);
    for (const elevation of [-2, 0, 3]) {
      const y = baseline - elevation * scale;
      expect(y + platformDepth(y, scale, false, h) * .65).toBeGreaterThan(h);
      expect(platformDepth(y, scale, true, h)).toBe(scale * 1.35);
    }
  });
  it('places stable flora away from ledges, hazards and collectibles', () => {
    const p = { x: -20, width: 100, y: 0 };
    const obstacles = [{ x: 14, y: 0, hit: false }];
    const items = [{ x: 28, y: .9, taken: false, value: 100 }];
    const before = JSON.stringify({ p, obstacles, items });
    const plants = platformPlants(p, obstacles, items);
    expect(plants.some(plant => plant.tree)).toBe(true);
    expect(plants.some(plant => !plant.tree)).toBe(true);
    for (const plant of plants) {
      expect(plant.x).toBeGreaterThanOrEqual(p.x + 2);
      expect(plant.x).toBeLessThan(p.x + p.width - 2);
      expect(Math.abs(plant.x - 14)).toBeGreaterThanOrEqual(plant.tree ? 3.5 : 1.6);
      expect(Math.abs(plant.x - 28)).toBeGreaterThanOrEqual(plant.tree ? 2.5 : .8);
    }
    expect(JSON.stringify({ p, obstacles, items })).toBe(before);
    expect(platformPlants(p, [{ ...obstacles[0], hit: true }], [{ ...items[0], taken: true }])).toEqual(plants);
    expect(platformPlants({ ...p, upper: true }, [], []).every(plant => !plant.tree)).toBe(true);
  });
  it.each([[1256, 540], [366, 520], [720, 390]])('keeps at least 17 world units ahead at %i × %i', (w, h) => {
    const frame = framing(w, h);
    expect((w - frame.anchor) / frame.scale).toBeGreaterThan(17);
    expect(frame.scale).toBeGreaterThan(0);
  });
  it('renders every stage without changing simulation, course or input history', () => {
    const { art, commands, canvas } = renderer();
    art.resize(366, 520);
    expect(canvas.width).toBe(732); // DPR capped at two.
    for (const x of [0, 130, 350, 660]) {
      const run = new Run(123); run.x = x; run.tick = Math.floor(x / 9 * 60);
      const before = JSON.stringify(run);
      art.draw(run, 1 / 60, false);
      expect(JSON.stringify(run)).toBe(before);
    }
    expect(commands.length).toBeGreaterThan(100);
    expect(commands.flat().filter(v => typeof v === 'number').every(Number.isFinite)).toBe(true);
  });
  it('freezes presentation during pause and restores initial view on reset', () => {
    const { art, commands } = renderer(); art.resize(1000, 540);
    const run = new Run(42); run.tick = 1200; run.x = 130; run.grounded = false; run.held = true;
    art.draw(run, .1, false); commands.length = 0;
    art.draw(run, .1, true); const first = JSON.stringify(commands); commands.length = 0;
    art.draw(run, .1, true); expect(JSON.stringify(commands)).toBe(first);
    art.reset(); commands.length = 0; art.draw(new Run(42), 0, true);
    const reset = JSON.stringify(commands); commands.length = 0;
    art.reset(); art.draw(new Run(42), 0, true); expect(JSON.stringify(commands)).toBe(reset);
  });
});
