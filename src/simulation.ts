// Rendering-independent practice rules. Versioned; not yet a trusted score protocol.
export const RULES = 'paper-run-practice-v5';
export const DT = 1 / 60;
export const DURATION = 90;
export const FINISH_X = 721; // Integrated travel at 89 seconds, before respawn offsets.
export const SHIELD_NOTES = 24;
export const SHIELD_SECONDS = 2.5;
export type Platform = { x: number; width: number; y: number; upper?: boolean; precision?: boolean };
export type Item = { x: number; y: number; taken: boolean; value: number; finish?: boolean; risky?: boolean; optional?: boolean; missed?: boolean; awardedScore?: number };
export type Obstacle = { x: number; y: number; ceiling?: boolean; hit: boolean; height?: number; halfWidth?: number; motion?: { axis: 'x' | 'y'; amplitude: number; period: number; phase: number } };
// Simulation time is shared by rendering and collision; pause freezes both.
export function obstaclePosition(o: Obstacle, time: number) {
  const m = o.motion;
  const offset = m ? Math.sin(time * Math.PI * 2 / m.period + m.phase) * m.amplitude : 0;
  return { x: o.x + (m?.axis === 'x' ? offset : 0), y: o.y + (m?.axis === 'y' ? offset : 0) };
}
export type Section = { x: number; end: number; kind: 'jump' | 'glide' | 'choice' | 'tunnel' | 'rest' };
export type InputEvent = { tick: number; held: boolean };
export function random(seed: number) {
  let value = seed >>> 0;
  return () => { value += 0x6d2b79f5; let t = value; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function makeCourse(seed: number) {
  const rng = random(seed);
  // Separate streams: tuning motion/rewards must not reshuffle terrain.
  const motionRng = random(seed ^ 0x71ac932f);
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
    const varied = end >= 230; // ~30 seconds
    const pressure = end >= 381; // ~50 seconds
    const finale = end >= 551; // ~70 seconds
    let kind: Section['kind'] = warmup ? 'jump' : kinds[(index + offset) % kinds.length];
    // Late runs alternate active combinations with a short recovery section.
    if (pressure) {
      const sequence: Section['kind'][] = finale ? ['jump', 'tunnel', 'glide', 'rest'] : ['jump', 'tunnel', 'choice', 'glide', 'rest'];
      kind = sequence[(index + offset) % sequence.length];
    }
    const previousY = terrainY;
    if ((varied && kind !== 'rest') || index % 4 === 1 || index % 4 === 2) {
      const direction = terrainY >= 2 ? -1 : terrainY <= -1 ? 1 : rng() < 0.5 ? -1 : 1;
      terrainY += direction * 0.9;
    }
    const rise = terrainY - previousY;
    const gap = rise > 0 ? (finale ? 2.2 + rng()*.3 : 1.8 + rng()*.7) : kind === 'glide' ? 5.2 + rng()*.8 : finale && kind !== 'rest' ? 4.2 + rng()*1.4 : 1.8 + rng()*1.8;
    const x = end + gap;
    const width = warmup ? 25 + rng() * 5 : kind === 'tunnel' ? 36 + rng()*2 : kind === 'choice' ? 32+rng()*2 : kind === 'jump' ? (finale ? 31 : pressure ? 23 : 28) + rng()*2 : pressure && kind === 'glide' ? 26+rng()*2 : finale && kind === 'rest' ? 16+rng()*2 : 25 + rng()*3;
    platforms.push({ x, width, y: terrainY });
    const firstObstacle = obstacles.length;
    const firstItem = items.length;
    sections.push({ x: end, end: x + width, kind });
    if (kind === 'jump') {
      const positions = warmup ? [width*0.55] : finale ? [7.5,15,22.5] : pressure ? [7.5,15] : [8,18];
      // At 9 units/s, 7.5-unit spacing permits a short jump plus recovery.
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
      obstacles.push({x:x+7.5,y:0,hit:false,...(pressure ? {height:1.7,halfWidth:1.25} : {})});
      for (const dx of [pressure ? 13 : 15,18]) obstacles.push({x:x+dx, y:2.25, ceiling:true, hit:false});
      obstacles.push({x:x+27,y:0,hit:false});
    }
    // After ~50s, weave lifting roofs between lateral spike groups, not just
    // in tunnels. Higher minimum clearance preserves the short-jump route
    // while catching long glides; quiet sections still offer a breather.
    if (pressure && kind !== 'tunnel' && kind !== 'rest') {
      const roofs = kind === 'jump' ? (finale ? [11.5,19] : [11.5]) : kind === 'glide' ? [14] : [26];
      for (const dx of roofs) obstacles.push({x:x+dx,y:3.45,ceiling:true,hit:false});
    }
    // Do not let a randomly selected rest section hide the introduction.
    if (kind === 'rest' && x + width / 2 >= 268.2) {
      obstacles.push({x:x+width/2,y:0,hit:false});
    }
    for (let i=firstObstacle;i<obstacles.length;i++) obstacles[i].y += terrainY;
    // 40% of 90 seconds: integrated speed gives 7*36 + 36²/80 = 268.2 units.
    if (x + width >= 268.2) {
      const candidates = obstacles.slice(firstObstacle).filter(o => o.x >= 268.2);
      // Clear entry/exit margins and a guaranteed standing-height passage under roofs.
      // Derive phase without consuming the course RNG, preserving early layouts.
      for (const [j, obstacle] of candidates.entries()) {
        if (!obstacle.ceiling && (obstacle.y !== terrainY || obstacle.height)) continue;
        const variant = (index + j) % 3;
        const phase = motionRng() * Math.PI * 2;
        obstacle.motion = obstacle.ceiling
          ? { axis: 'y', amplitude: (finale ? .85 : .6) + motionRng()*.25, period: (finale ? 1.9 : 2.5) + variant*.4 + motionRng()*.2, phase }
          : { axis: 'x', amplitude: .4 + motionRng()*(finale ? .25 : .15), period: (finale ? 1.7 : 2.1) + variant*.5 + motionRng()*.2, phase };
        if (obstacle.ceiling) obstacle.y += obstacle.motion.amplitude - .3;
      }
    }
    for (let i=firstItem;i<items.length;i++) items[i].y += terrainY;
    end = x + width;
    index++;
  }
  // Replace late recovery floors with three actual islands; no hidden floor
  // remains underneath. Alternate heights within the existing jump envelope.
  for (const section of sections.filter(s=>s.x>=551 && s.kind==='rest')) {
    const at=platforms.findIndex(p=>!p.upper && p.x>section.x && p.x<section.end);
    const floor=platforms[at], gap=2, width=(floor.width-gap*2)/3;
    const islands=Array.from({length:3},(_,i)=>({x:floor.x+i*(width+gap),width,y:floor.y+(i===1?.6:0),precision:true}));
    platforms.splice(at,1,...islands);
    for(let i=obstacles.length-1;i>=0;i--) if(obstacles[i].x>=floor.x && obstacles[i].x<section.end) obstacles.splice(i,1);
    const middle=islands[1];
    obstacles.push({x:middle.x+middle.width*.55,y:middle.y,hit:false,halfWidth:.4});
  }
  for (let x = 20; x < 900; x += 8) {
    const floor = platforms.find(p => !p.upper && x >= p.x && x <= p.x + p.width);
    const overGap = !floor;
    const next = platforms.find(p => !p.upper && p.x > x);
    const groundY = floor?.y ?? next?.y ?? 0;
    const nearObstacle = obstacles.some(o => !o.ceiling && Math.abs(o.y-groundY)<0.01 && Math.abs(o.x - x) < 2);
    const inTunnel = sections.some(s => s.kind === 'tunnel' && x >= s.x && x <= s.end);
    const optional=sections.some(s=>s.kind==='choice' && x>=s.x && x<=s.end);
    items.push({ x, y: groundY + (overGap || nearObstacle ? 2.4 : (inTunnel ? 0.9 : rng() > 0.55 ? 2.4 : 0.9)), value:100, taken: false, optional });
  }
  // Keep the existing reward count and denominations, but require deliberate
  // high-route commitment for late notes instead of collecting them incidentally.
  for (const section of sections.filter(s=>s.x>=381 && s.kind!=='rest')) {
    const floor=platforms.find(p=>!p.upper && p.x>section.x && p.x<section.end)!;
    const notes=items.filter(i=>i.x>=floor.x && i.x<=section.end && i.value===100);
    const roofs=obstacles.filter(o=>o.ceiling && o.x>=floor.x && o.x<=section.end);
    for (const [i,note] of notes.entries()) {
      if (i%2===0 && roofs.length) {
        const roof=roofs[Math.floor(i/2)%roofs.length];
        note.x=roof.x-1.8-Math.floor(Math.floor(i/2)/roofs.length)*.7;
        note.y=floor.y+2.65; note.risky=true;
      } else {
        // Lower route rewards sit away from the swept ground-spike footprint.
        const spike=obstacles.find(o=>!o.ceiling && Math.abs(o.x-note.x)<2);
        note.y=floor.y+(spike ? 2.4 : .9);
      }
    }
  }
  // A real world item, present from course creation and naturally scrolling in.
  // If the finish is in a gap, use the next landing height (reachable by gliding).
  const finishFloor = platforms.find(p => !p.upper && p.x + p.width >= FINISH_X)!;
  items.push({x:FINISH_X,y:finishFloor.y+1.6,value:2000,taken:false,finish:true});
  return { platforms, items, obstacles, sections };
}
export class Run {
  readonly course;
  readonly inputs: InputEvent[] = [];
  tick = 0; x = 0; distance = 0; y = 0; vy = 0; lives = 3; grounded = true;
  held = false; pendingJump = false; invincible = 0; combo = 0; collected = 0;
  pickupScore = 0; shield = 0; finished = false; won = false;
  finishCollected = false;
  comboBreaks = 0;
  lastComboBreak: 'miss' | 'hit' = 'miss';
  breakCombo(reason: 'miss' | 'hit') {
    if(this.combo>0) { this.comboBreaks++; this.lastComboBreak=reason; }
    this.combo=0;
  }
  constructor(readonly seed: number) { this.course = makeCourse(seed); }
  get time() { return this.tick * DT; }
  get terrainHeight() { return this.course.platforms.find(p=>!p.upper && p.x+p.width>=this.x)?.y ?? 0; }
  get speed() { return 7 + Math.min(2, this.time / 40); }
  get multiplier() { return Math.min(3, 1 + Math.floor(this.combo / 8)); }
  get score() { return Math.floor(this.distance * 10) + this.pickupScore + (this.finishCollected ? 2000 : 0); }
  input(held: boolean) {
    if (this.finished || this.held === held) return;
    this.inputs.push({ tick: this.tick, held }); this.held = held;
    if (held && this.grounded) this.pendingJump = true;
  }
  damage(fall = false) {
    if (this.invincible <= 0 && this.shield <= 0) { this.lives--; this.breakCombo('hit'); this.invincible = 1.6; }
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
      const pos = obstaclePosition(o, this.time);
      const collision = o.ceiling ? this.y + 1.6 > pos.y && this.y < pos.y+0.65 : this.y < pos.y+(o.height ?? .85) && this.y > pos.y-0.6;
      if (!o.hit && Math.abs(pos.x - this.x) < (o.ceiling ? 1.2 : o.halfWidth ?? .65) && collision) { o.hit = true; this.damage(); }
    }
    for (const item of this.course.items) {
      // Retire misses once past even the shield's magnet radius. Only unchosen
      // branch rewards and the finish seal are exempt; missed risk notes count.
      if (!item.taken && !item.missed && this.x > item.x+2.6) {
        item.missed=true;
        if (!item.finish && !item.optional) this.breakCombo('miss');
      }
    }
    for (const item of this.course.items) {
      const radius = !item.finish && this.shield > 0 ? 2.6 : 1;
      if (!this.finished && !item.taken && Math.abs(item.x - this.x) < radius && Math.abs(item.y - (this.y + 0.8)) < radius) {
        if (item.finish) { item.taken = true; item.awardedScore = 2000; this.finishCollected = true; continue; }
        item.taken = true; this.combo++; this.collected++; item.awardedScore = item.value * this.multiplier; this.pickupScore += item.awardedScore;
        if (this.collected % SHIELD_NOTES === 0) this.shield = Math.max(this.shield, SHIELD_SECONDS);
      }
    }
    if (!this.finished && this.tick >= DURATION / DT) { this.won = true; this.finished = true; }
  }
}
