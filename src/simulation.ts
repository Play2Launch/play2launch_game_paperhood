// Rendering-independent practice rules. Versioned; not yet a trusted score protocol.
export const RULES = 'paper-run-practice-v5';
export const DT = 1 / 60;
export const DURATION = 90;
export const SHIELD_NOTES = 24;
export const SHIELD_SECONDS = 2.5;
export type Platform = { x: number; width: number; y: number; upper?: boolean };
export type Item = { x: number; y: number; taken: boolean; value: number };
export type Obstacle = { x: number; y: number; ceiling?: boolean; hit: boolean };
export type Section = { x: number; end: number; kind: 'jump' | 'glide' | 'choice' | 'tunnel' | 'rest' };
export type InputEvent = { tick: number; held: boolean };
export function random(seed: number) {
  let value = seed >>> 0;
  return () => { value += 0x6d2b79f5; let t = value; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function makeCourse(seed: number) {
  const rng = random(seed);
  const platforms: Platform[] = [{ x: -20, width: 48, y: 0 }];
  const items: Item[] = [];
  const obstacles: Obstacle[] = [];
  const sections: Section[] = [];
  let end = 28;
  let index = 0;
  let terrainY = 0;
  const kinds = ['jump', 'choice', 'glide', 'tunnel', 'rest'] as const;
  const offset = Math.floor(rng() * 4);
  // Constrained height runs: two steps then two flat recovery sections.
  while (end < 1000) {
    const warmup = end < 112;
    const pressure = end >= 315;
    const finale = end >= 600;
    let kind: Section['kind'] = warmup ? 'jump' : kinds[(index + offset) % kinds.length];
    // Later rests become active jump sections; occasional breathers remain before the finale.
    if (kind === 'rest' && pressure) kind = 'jump';
    const previousY = terrainY;
    if (pressure || index % 4 === 1 || index % 4 === 2) {
      const direction = terrainY >= 2 ? -1 : terrainY <= -1 ? 1 : rng() < 0.5 ? -1 : 1;
      terrainY += direction * 0.9;
    }
    const rise = terrainY - previousY;
    const gap = rise > 0 ? 1.8 + rng()*0.7 : kind === 'glide' ? 5.2 + rng()*0.8 : 1.8 + rng()*1.8;
    const x = end + gap;
    const width = warmup ? 25 + rng() * 5 : kind === 'tunnel' ? 36 + rng()*2 : kind === 'choice' ? 32+rng()*2 : kind === 'jump' ? (finale ? 32 : pressure ? 24 : 28) + rng()*2 : pressure && kind === 'glide' ? 27+rng()*2 : 25 + rng()*3;
    platforms.push({ x, width, y: terrainY });
    const firstObstacle = obstacles.length;
    const firstItem = items.length;
    sections.push({ x: end, end: x + width, kind });
    if (kind === 'jump') {
      const positions = warmup ? [width*0.55] : finale ? [7.5,15.5,23.5] : pressure ? [7.5,15.5] : [8,18];
      // At 9 units/s, 8-unit spacing permits a short jump plus recovery, not endless gliding.
      for (const dx of positions) obstacles.push({x:x+dx,y:0,hit:false});
    }
    if (kind === 'glide') {
      obstacles.push({x:x+10,y:0,hit:false});
      if (pressure) obstacles.push({x:x+18,y:0,hit:false});
    }
    if (kind === 'choice') {
      platforms.push({ x: x+5, width: 6, y: terrainY+1.8, upper: true });
      platforms.push({ x: x+13, width: 6, y: terrainY+2.9, upper: true });
      for (const dx of [7, 10, 15, 18]) items.push({ x:x+dx, y:dx<12?2.7:3.8, value:200, taken:false });
      obstacles.push({x:x+16, y:2.9, hit:false});
      // Lower route is easier, no longer an idle bypass. Its late obstacle is past the upper lane.
      obstacles.push({x:x+22,y:0,hit:false});
    }
    if (kind === 'tunnel') {
      // Jump → release → run underneath → jump again. No spike sits beneath the roof.
      obstacles.push({x:x+7.5,y:0,hit:false});
      for (const dx of [15,18]) obstacles.push({x:x+dx, y:2.25, ceiling:true, hit:false});
      obstacles.push({x:x+27,y:0,hit:false});
    }
    for (let i=firstObstacle;i<obstacles.length;i++) obstacles[i].y += terrainY;
    for (let i=firstItem;i<items.length;i++) items[i].y += terrainY;
    end = x + width;
    index++;
  }
  for (let x = 20; x < 900; x += 8) {
    const floor = platforms.find(p => !p.upper && x >= p.x && x <= p.x + p.width);
    const overGap = !floor;
    const next = platforms.find(p => !p.upper && p.x > x);
    const groundY = floor?.y ?? next?.y ?? 0;
    const nearObstacle = obstacles.some(o => !o.ceiling && Math.abs(o.y-groundY)<0.01 && Math.abs(o.x - x) < 2);
    const inTunnel = sections.some(s => s.kind === 'tunnel' && x >= s.x && x <= s.end);
    items.push({ x, y: groundY + (overGap || nearObstacle ? 2.4 : (inTunnel ? 0.9 : rng() > 0.55 ? 2.4 : 0.9)), value:100, taken: false });
  }
  return { platforms, items, obstacles, sections };
}
export class Run {
  readonly course;
  readonly inputs: InputEvent[] = [];
  tick = 0; x = 0; distance = 0; y = 0; vy = 0; lives = 3; grounded = true;
  held = false; pendingJump = false; invincible = 0; combo = 0; collected = 0;
  pickupScore = 0; shield = 0; finished = false; won = false;
  constructor(readonly seed: number) { this.course = makeCourse(seed); }
  get time() { return this.tick * DT; }
  get terrainHeight() { return this.course.platforms.find(p=>!p.upper && p.x+p.width>=this.x)?.y ?? 0; }
  get speed() { return 7 + Math.min(2, this.time / 40); }
  get multiplier() { return Math.min(3, 1 + Math.floor(this.combo / 8)); }
  get score() { return Math.floor(this.distance * 10) + this.pickupScore + (this.won ? 2000 : 0); }
  input(held: boolean) {
    if (this.finished || this.held === held) return;
    this.inputs.push({ tick: this.tick, held }); this.held = held;
    if (held && this.grounded) this.pendingJump = true;
  }
  damage(fall = false) {
    if (this.invincible <= 0 && this.shield <= 0) { this.lives--; this.combo = 0; this.invincible = 1.6; }
    if (fall) {
      const landing = this.course.platforms.find(p => !p.upper && p.x + p.width > this.x + 1);
      this.x = Math.max(this.x, (landing?.x ?? this.x) + 0.7);
      this.y = landing?.y ?? 0; this.vy = 0; this.grounded = true;
    }
    if (this.lives <= 0) this.finished = true;
  }
  step() {
    if (this.finished) return;
    this.tick++;
    this.invincible = Math.max(0, this.invincible - DT); this.shield = Math.max(0, this.shield - DT);
    if (this.pendingJump && this.grounded) { this.vy = 10.5; this.grounded = false; }
    this.pendingJump = false;
    this.x += this.speed * DT;
    this.distance += this.speed * DT;
    const lastY = this.y;
    this.vy -= (this.held && this.vy < 0 ? 7 : 27) * DT;
    if (this.held && this.vy < -2.8) this.vy = -2.8;
    this.y += this.vy * DT;
    const platform = this.course.platforms.filter(p => this.x >= p.x && this.x <= p.x + p.width && lastY >= p.y - 0.01 && this.y <= p.y && this.vy <= 0).sort((a,b) => b.y-a.y)[0];
    if (platform) {
      this.y = platform.y; this.vy = 0; this.grounded = true;
    } else this.grounded = false;
    if (this.y < this.terrainHeight - 5) this.damage(true);
    for (const o of this.course.obstacles) {
      const collision = o.ceiling ? this.y + 1.6 > o.y && this.y < o.y+0.65 : this.y < o.y+0.85 && this.y > o.y-0.6;
      if (!o.hit && Math.abs(o.x - this.x) < (o.ceiling ? 1.2 : 0.65) && collision) { o.hit = true; this.damage(); }
    }
    for (const item of this.course.items) {
      const radius = this.shield > 0 ? 2.6 : 1;
      if (!item.taken && Math.abs(item.x - this.x) < radius && Math.abs(item.y - (this.y + 0.8)) < radius) {
        item.taken = true; this.combo++; this.collected++; this.pickupScore += item.value * this.multiplier;
        if (this.collected % SHIELD_NOTES === 0) this.shield = Math.max(this.shield, SHIELD_SECONDS);
      }
    }
    if (!this.finished && this.tick >= DURATION / DT) { this.won = true; this.finished = true; }
  }
}
