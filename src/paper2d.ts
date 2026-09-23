import type { Run, Platform, Obstacle, Item } from './simulation';
import { obstaclePosition } from './simulation';
import { PaperArt } from './paper-art';

// Presentation only: coordinates remain in simulation units; never consume its RNG.
export function framing(width: number, height: number) {
  const scale = Math.min(height / 12, width / 23);
  return { scale, anchor: width * 0.23, baseline: height * 0.66 };
}

// Stable decoration positions, independent of simulation RNG and current hits.
export function platformPlants(p: Platform, obstacles: Obstacle[], items: Item[]) {
  const plants: { x: number; tree: boolean }[] = [];
  for (let x = Math.ceil((p.x + 2) / 7) * 7; x < p.x + p.width - 2; x += 7) {
    const tree = !p.upper && Math.abs(Math.round(x / 7)) % 7 === 0;
    const clearance = tree ? 3.5 : 1.6;
    if (obstacles.some(o => Math.abs(o.x - x) < clearance)) continue;
    if (items.some(item => Math.abs(item.x - x) < (tree ? 2.5 : .8))) continue;
    plants.push({ x, tree });
  }
  return plants;
}

export class Paper2D {
  readonly art = new PaperArt();
  readonly canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private width = 1;
  private height = 1;
  private ground = 0;
  private spread = 0;
  private lastNotes = 0;
  private lastLives = 3;
  private shownPickups = new WeakSet<Item>();
  private scorePopups: { score: number; life: number; finish: boolean }[] = [];
  private particles: { x: number; y: number; vx: number; vy: number; life: number; hurt: boolean }[] = [];
  constructor(private reducedMotion: boolean) {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unavailable');
    this.ctx = ctx;
    this.canvas.setAttribute('aria-label', 'Paperhood paper-art game scene');
  }
  resize(width: number, height: number) {
    this.width = width; this.height = height;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(width * ratio); this.canvas.height = Math.round(height * ratio);
    this.canvas.style.width = `${width}px`; this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  reset() {
    this.ground = 0; this.spread = 0; this.lastNotes = 0; this.lastLives = 3; this.particles = [];
    this.shownPickups = new WeakSet<Item>(); this.scorePopups = [];
  }
  private polygon(points: number[][], fill: string, stroke?: string) {
    const c = this.ctx; c.beginPath();
    points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
    c.closePath(); c.fillStyle = fill; c.fill();
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1; c.stroke(); }
  }
  private line(points: number[][], color: string, width = 1) {
    const c = this.ctx; c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
    c.strokeStyle = color; c.lineWidth = width; c.stroke();
  }
  draw(run: Run, delta: number, frozen: boolean) {
    const c = this.ctx, w = this.width, h = this.height;
    if (!frozen) {
      this.ground += (run.terrainHeight - this.ground) * (1 - Math.exp(-delta * 2));
      this.spread += ((run.held && !run.grounded ? 1 : 0) - this.spread) * (1 - Math.exp(-delta * 10));
    }
    const { scale: s, anchor, baseline } = framing(w, h);
    const sx = (x: number) => anchor + (x - run.x) * s;
    const sy = (y: number) => baseline - (y - this.ground) * s;
    const time = this.reducedMotion ? 0 : run.time;
    const phase = run.time < 15 ? 0 : run.time < 40 ? 1 : run.time < 70 ? 2 : 3;
    const bg = c.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, ['#111e1c', '#142820', '#24202c', '#2b201c'][phase]);
    bg.addColorStop(1, '#0c1512'); c.fillStyle = bg; c.fillRect(0, 0, w, h);

    if (!this.art.background(c, w, h, this.reducedMotion ? 0 : run.x, s)) {
    // Lightweight fallback if raster assets are unavailable.
    const mx = w * .76, my = h * .25, mr = Math.min(w * .065, h * .13);
    c.fillStyle = '#ced9ae'; c.globalAlpha = .12; c.beginPath(); c.arc(mx, my, mr, 0, Math.PI * 2); c.fill();
    this.polygon([[mx - mr, my], [mx + mr * .7, my - mr * .7], [mx + mr * .5, my + mr * .86]], '#e0ebbf');
    c.globalAlpha = 1;
    c.fillStyle = '#64745a';
    for (let i = 0; i < 46; i++) { c.globalAlpha = .12 + (i % 3) * .07; c.fillRect((i * 137.3) % w, (i * 79.7) % (h * .58), 1.5, 1.5); }
    c.globalAlpha = 1;
    for (let layer = 0; layer < 3; layer++) {
      const span = 88 + layer * 31, offset = run.x * (2 + layer * 2) % span;
      for (let i = -1; i < w / span + 2; i++) {
        const index = i + Math.floor(run.x * (2 + layer * 2) / span);
        const tall = 32 + (Math.abs(index * 17 + layer * 31) % 89);
        const x = i * span - offset, y = h * (.57 + layer * .08);
        this.polygon([[x, y], [x, y - tall], [x + span * .3, y - tall - 18], [x + span * .76, y - tall + 10], [x + span * .76, y]], ['#1c302a', '#20362c', '#263c2e'][layer]);
        this.line([[x + span * .3, y - tall - 18], [x + span * .3, y]], '#334735');
      }
    }
    const chart = Array.from({ length: 28 }, (_, i) => [i * w / 27, h * .43 + Math.sin(i * 1.7 + run.x * .014) * 24]);
    c.globalAlpha = .24; this.line(chart, '#a5c276'); c.globalAlpha = 1;
    }

    for (const p of run.course.platforms) {
      const x = sx(p.x), right = sx(p.x + p.width), y = sy(p.y);
      if (right < -40 || x > w + 40) continue;
      // Behind the playable silhouette; never hides a spike or a collectible.
      for (const plant of platformPlants(p, run.course.obstacles, run.course.items)) {
        if (sx(plant.x) > -s * 4 && sx(plant.x) < w + s * 4)
          this.art.plant(c, sx(plant.x), y, s, plant.tree);
      }
      if (this.art.platform(c, x, right, y, s, !!p.upper, w, h)) continue;
      const bottom = p.upper ? y + s * .24 : Math.max(y + s * 2.1, h + 30);
      this.polygon([[x, y], [right, y], [right - 7, bottom - 8], [right - 25, bottom + 7], [x + 12, bottom], [x, bottom - 18]], '#293d2c', '#435a39');
      this.polygon([[x, y], [right, y], [right - 14, y + s * .22], [x + 10, y + s * .22]], '#729354');
      this.line([[x, y], [right, y]], p.upper ? '#e2e8b8' : '#c9ef88', 2);
      if (!p.upper) {
        for (let k = 1; k < p.width / 2.8; k++) {
          const xx = x + k * s * 2.8;
          this.polygon([[xx, y + s * .25], [xx + s * 1.6, bottom - 8], [xx - s * .5, bottom - 6]], k % 2 ? '#314b32' : '#233529');
        }
        this.line([[x + 12, bottom - 4], [right - 22, bottom + 4]], '#15251e');
      }
    }
    for (const o of run.course.obstacles) {
      const pos = obstaclePosition(o, run.time);
      const x = sx(pos.x), y = sy(pos.y);
      if (o.hit || x < -40 || x > w + 40) continue;
      if (o.height) {
        const half=(o.halfWidth ?? .65)*s, height=o.height*s;
        // Cut three teeth into the existing silhouette, never above its original top.
        this.polygon([[x-half,y],[x-half,y-height*.62],[x-half*.68,y-height*.91],[x-half*.34,y-height*.62],[x,y-height],[x+half*.34,y-height*.62],[x+half*.68,y-height*.91],[x+half,y-height*.62],[x+half,y]],'#a34435','#ffc18a');
        for (const [tip, peak, right] of [[x-half*.68,y-height*.91,x-half*.34],[x,y-height,x+half*.34],[x+half*.68,y-height*.91,x+half]]) {
          this.polygon([[tip,peak],[right,y-height*.62],[tip,y-height*.48]],'#753329');
          this.line([[tip,peak],[tip,y-height*.48]],'#ed8c63',1);
        }
        this.line([[x-half,y-height*.45],[x,y-height*.32],[x+half,y-height*.45]],'#ed8c63',2);
        c.save(); c.fillStyle='#ffe3a8'; c.font=`bold ${Math.max(10,s*.35)}px sans-serif`; c.textAlign='center'; c.fillText('HOLD',x,y-height-s*.3); c.restore();
        continue;
      }
      if (o.motion) {
        const { axis, amplitude } = o.motion;
        const railY = o.y - (axis === 'x' ? .12 : 0);
        const start = [sx(o.x - (axis === 'x' ? amplitude + .72 : 0)), sy(railY - (axis === 'y' ? amplitude : 0))];
        const end = [sx(o.x + (axis === 'x' ? amplitude + .72 : 0)), sy(railY + (axis === 'y' ? amplitude : 0))];
        this.line([start, end], '#f3b47899', 2);
        for (const [tx, ty] of [start, end]) { c.fillStyle = '#f3b478'; c.fillRect(tx-2,ty-2,4,4); }
        if (axis === 'x') {
          // The carriage extends below the existing spike base; collision height stays unchanged.
          c.fillStyle = '#873e32'; c.fillRect(x-s*.7,y,s*1.4,s*.25);
          this.line([[x-s*.7,y],[x+s*.7,y]], '#ffc18a', 2);
          this.line([[x-s*.5,y+s*.22],[x+s*.5,y+s*.22]], '#452a25', 2);
          c.save(); c.beginPath(); c.rect(x-s*.7,y,s*1.4,s*.25); c.clip();
          this.art.grain(c,x-s*.7,y,s*1.4,s*.25); c.restore();
        }
      }
      if (this.art.hazard(c, x, y, s, !!o.ceiling)) continue;
      if (o.ceiling) {
        c.fillStyle = '#b34a41'; c.fillRect(x - 1.1 * s, y - .65 * s, 2.2 * s, .65 * s);
        this.line([[x - 1.1 * s, y], [x + 1.1 * s, y]], '#ffae85', 2);
        for (let j = -1; j <= 1; j++) this.line([[x + j * s * .65 - .2 * s, y - .55 * s], [x + j * s * .65 + .15 * s, y - .1 * s]], '#e27d5c', 2);
      } else {
        this.polygon([[x - .65 * s, y], [x, y - 1.2 * s], [x + .65 * s, y]], '#f07659', '#ffc299');
        this.polygon([[x, y - 1.2 * s], [x + .65 * s, y], [x - .05 * s, y - .12 * s]], '#ab403e');
      }
      c.save(); c.beginPath();
      if (o.ceiling) c.rect(x - 1.1 * s, y - .65 * s, 2.2 * s, .65 * s);
      else { c.moveTo(x - .65 * s, y); c.lineTo(x, y - 1.2 * s); c.lineTo(x + .65 * s, y); c.closePath(); }
      c.clip(); this.art.grain(c, x - 1.1 * s, y - 1.2 * s, 2.2 * s, 1.2 * s); c.restore();
    }
    for (const item of run.course.items) {
      const x = sx(item.x), y = sy(item.y);
      if (item.taken || x < -25 || x > w + 25) continue;
      if (item.finish) {
        c.save(); c.translate(x, y);
        c.shadowColor = '#ffe39a'; c.shadowBlur = 18;
        this.polygon([[0,-s*.95],[s*.65,0],[0,s*.95],[-s*.65,0]], '#f3d68b', '#fff5c9');
        c.shadowBlur = 0;
        this.polygon([[0,-s*.65],[s*.4,0],[0,s*.65],[-s*.4,0]], '#8a713a', '#fff5c9');
        c.fillStyle = '#fff5c9'; c.textAlign = 'center'; c.font = `bold ${Math.max(10,s*.38)}px sans-serif`;
        c.fillText('FINISH +2000', 0, -s*1.25);
        c.restore(); continue;
      }
      c.save(); c.translate(x, y); c.rotate(-.22 + Math.sin(time * 2 + item.x) * .08);
      const gold = item.value === 200;
      c.shadowColor = gold ? '#ffdda5' : '#cfff6b'; c.shadowBlur = 9;
      c.fillStyle = gold ? '#f0d8a5' : '#c0e975'; c.fillRect(-s * .24, -s * .325, s * .48, s * .65);
      c.shadowBlur = 0;
      c.save(); c.beginPath(); c.rect(-s * .24, -s * .325, s * .48, s * .65); c.clip();
      this.art.grain(c, -s * .24, -s * .325, s * .48, s * .65); c.restore();
      this.line([[-s * .13, -s * .2], [s * .13, -s * .2], [s * .13, s * .2], [-s * .13, s * .2]], '#698149');
      c.fillStyle = '#526a35'; c.fillRect(-s * .035, -s * .075, s * .07, s * .15); c.restore();
    }
    if (run.invincible <= 0 || Math.floor(run.time * 12) % 2 === 0) {
      this.mage(anchor, sy(run.y), s, time, run.shield > 0);
    }
    if (run.collected > this.lastNotes || run.lives < this.lastLives) {
      const hurt = run.lives < this.lastLives;
      for (let i = 0; i < (this.reducedMotion ? 3 : 12); i++) this.particles.push({ x: run.x, y: run.y + 1, vx: Math.cos(i * 2.4) * 3, vy: 2 + Math.sin(i * 1.7) * 2, life: .6, hurt });
    }
    this.lastNotes = run.collected; this.lastLives = run.lives;
    for (const p of this.particles) {
      if (!frozen) { p.life -= delta; p.x += p.vx * delta; p.y += p.vy * delta; p.vy -= delta * 9; }
      c.save(); c.globalAlpha = Math.max(0, p.life / .6); c.translate(sx(p.x), sy(p.y)); c.rotate(p.life * 7);
      c.fillStyle = p.hurt ? '#ffb28e' : '#d2fa69'; c.fillRect(-2, -3, 4, 6); c.restore();
    }
    this.particles = this.particles.filter(p => p.life > 0);
    const shade = c.createLinearGradient(0, h * .83, 0, h); shade.addColorStop(0, '#0b120d00'); shade.addColorStop(1, '#0b120ddd');
    c.fillStyle = shade; c.fillRect(0, h * .83, w, h * .17);
    this.art.foreground(c, w, h, this.reducedMotion ? 0 : run.x, s, time);
    for (const item of run.course.items) {
      if (!item.taken || !item.awardedScore || this.shownPickups.has(item)) continue;
      this.shownPickups.add(item);
      this.scorePopups.push({score:item.awardedScore,life:1.1,finish:!!item.finish});
    }
    this.scorePopups = this.scorePopups.slice(-8);
    for (const [i, popup] of this.scorePopups.entries()) {
      if (!frozen) popup.life -= delta;
      const age = 1.1-popup.life;
      const fontSize = Math.max(16, Math.min(26, s*.65));
      const lift = this.reducedMotion ? 0 : age*30;
      const y = Math.max(fontSize, sy(run.y+2.3)-lift-(this.scorePopups.length-1-i)*(fontSize+3));
      c.save(); c.globalAlpha = Math.max(0,Math.min(1,popup.life/.35));
      c.font = `bold ${popup.finish ? fontSize+3 : fontSize}px sans-serif`;
      c.textAlign='center'; c.lineWidth=3; c.strokeStyle='#0a140c';
      c.fillStyle=popup.finish ? '#ffe29a' : '#d8ff90';
      const label=`+${popup.score}`;
      c.strokeText(label,anchor,y); c.fillText(label,anchor,y); c.restore();
    }
    this.scorePopups = this.scorePopups.filter(p=>p.life>0);
  }
  private mage(x: number, y: number, scale: number, time: number, shield: boolean) {
    const c = this.ctx, open = this.spread, wave = Math.sin(time * 9) * .045;
    c.save(); c.translate(x, y); c.scale(scale, scale);
    // A small rune orbit, not a running/shuffling foot cycle.
    c.strokeStyle = '#b9eb75'; c.lineWidth = .025; c.globalAlpha = .45;
    c.beginPath(); c.ellipse(0, -.12, .49, .1, 0, 0, Math.PI * 2); c.stroke();
    for (let i = 0; i < 5; i++) { const a = time * .8 + i * Math.PI * .4; c.fillStyle = '#d2fa69'; c.fillRect(Math.cos(a) * .46, -.12 + Math.sin(a) * .09, .045, .045); }
    c.globalAlpha = 1; c.translate(0, -.08 - Math.sin(time * 2.8) * .025);
    if (shield) { c.strokeStyle = '#d8ff9d'; c.lineWidth = .035; c.beginPath(); c.ellipse(0, -.88, .85, 1.02, -.12, 0, Math.PI * 2); c.stroke(); }
    if (this.art.mage(c, open, time)) { c.restore(); return; }
    // Broad, layered paper cape unfolds behind the silhouette when gliding.
    const tail = -1.02 - open * .7;
    this.polygon([[-.19, -1.3], [-.65, -1.1 - open * .4], [tail, -.35 - open * .35 + wave], [-.68, -.45], [-.76, -.16 + wave], [-.1, -.35], [.12, -.9]], '#365b38');
    this.polygon([[-.19, -1.3], [tail, -.35 - open * .35 + wave], [-.68, -.45], [-.1, -.35]], '#5f8548');
    this.polygon([[-.19, -1.3], [-.68, -.45], [-.76, -.16 + wave], [-.1, -.35]], '#253f2d');
    this.line([[tail, -.35 - open * .35 + wave], [-.65, -1.1 - open * .4], [-.19, -1.3]], '#b9da74', .023);
    this.line([[-.19, -1.3], [-.68, -.45]], '#8db364', .018);
    // Tucked boots and robe: no gait animation.
    this.polygon([[-.2, -.57], [-.25, -.2], [-.04, -.18], [.02, -.5]], '#192b24');
    this.polygon([[.04, -.54], [.03, -.19], [.25, -.14], [.31, -.22], [.17, -.29], [.23, -.59]], '#354139');
    this.polygon([[-.22, -1.17], [.22, -1.16], [.32, -.48], [-.3, -.43]], '#466847');
    this.polygon([[-.22, -1.17], [.02, -.9], [-.05, -.47], [-.3, -.43]], '#284832');
    this.line([[-.22, -.73], [.25, -.76]], '#c1b58b', .07);
    // Sleeve reaches gently forward with the glide, a paper talisman at the hand.
    this.polygon([[.12, -1.13], [.29, -1.12], [.5, -.86 - open * .22], [.41, -.74 - open * .24], [.15, -.88]], '#668552');
    this.polygon([[.41, -.83 - open * .23], [.56, -.85 - open * .23], [.55, -.73 - open * .23], [.43, -.73 - open * .23]], '#ded8bb');
    // Oversized angular hood; folded faceless mask, pointed brow and leaf.
    this.polygon([[-.42, -1.16], [-.47, -1.62], [-.24, -1.91], [.19, -1.86], [.43, -1.5], [.32, -1.15]], '#456b3b');
    this.polygon([[-.47, -1.62], [-.24, -1.91], [.19, -1.86], [-.05, -1.58], [-.42, -1.16]], '#739154');
    this.polygon([[-.05, -1.58], [.19, -1.86], [.43, -1.5], [.32, -1.15], [-.07, -1.14]], '#213f2c');
    this.polygon([[-.16, -1.53], [.14, -1.65], [.33, -1.43], [.07, -1.12], [-.18, -1.3]], '#ddd7bd');
    this.polygon([[.14, -1.65], [.33, -1.43], [.07, -1.12]], '#a7ac95');
    this.polygon([[-.16, -1.53], [.14, -1.65], [.07, -1.12]], '#f0e9ce');
    this.line([[-.39, -1.61], [-.08, -1.75], [.22, -1.74]], '#a7c176', .025);
    this.polygon([[-.19, -1.89], [-.21, -2.12], [.05, -2.2], [-.02, -1.99]], '#b5da6a');
    this.line([[-.19, -1.89], [.05, -2.2]], '#5d8646', .018);
    c.restore();
  }
}
