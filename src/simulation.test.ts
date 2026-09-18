import { describe, expect, it } from 'vitest';
import { Run, DT, DURATION, makeCourse, SHIELD_NOTES, SHIELD_SECONDS } from './simulation';

describe('seeded course', () => {
  it('reproduces a seed and varies different seeds', () => {
    expect(makeCourse(123)).toEqual(makeCourse(123));
    expect(makeCourse(123)).not.toEqual(makeCourse(124));
  });
  it('bounds gaps and leaves obstacle recovery/landing room across seeds', () => {
    for (let seed = 0; seed < 300; seed++) {
      const c = makeCourse(seed);
      const base = c.platforms.filter(p => !p.upper);
      for (let i = 1; i < base.length; i++) {
        const p = base[i], prev = base[i-1];
        expect(p.x - prev.x - prev.width).toBeLessThanOrEqual(6);
        expect(p.width).toBeGreaterThanOrEqual(15);
      }
      for (const o of c.obstacles) expect(base.some(p => o.x > p.x+6 && o.x < p.x+p.width-6)).toBe(true);
      expect(new Set(c.sections.map(s=>s.kind)).size).toBe(5);
      for (const p of c.platforms.filter(p=>p.upper)) expect(base.some(b=>p.x>=b.x && p.x+p.width<=b.x+b.width)).toBe(true);
    }
  });
  it('generates bounded rises and drops with shorter uphill gaps and terrain-relative objects', () => {
    for(let seed=0;seed<100;seed++) {
      const c=makeCourse(seed), base=c.platforms.filter(p=>!p.upper);
      let rises=0, drops=0;
      for(let i=1;i<base.length;i++) {
        const rise=base[i].y-base[i-1].y;
        if(rise>0.1) { rises++; expect(base[i].x-base[i-1].x-base[i-1].width).toBeLessThanOrEqual(2.500001); }
        if(rise< -0.1) drops++;
        expect(Math.abs(rise)).toBeLessThanOrEqual(0.900001);
        expect(base[i].y).toBeGreaterThanOrEqual(-1.81); expect(base[i].y).toBeLessThanOrEqual(2.71);
      }
      expect(rises).toBeGreaterThan(0); expect(drops).toBeGreaterThan(0);
      for(const item of c.items) {
        const ground=base.find(p=>item.x>=p.x && item.x<=p.x+p.width);
        if(ground) expect(item.y).toBeGreaterThan(ground.y);
      }
      for(const o of c.obstacles) {
        const ground=base.find(p=>o.x>=p.x && o.x<=p.x+p.width)!;
        expect(o.y).toBeGreaterThanOrEqual(ground.y);
      }
    }
  });
});
describe('practice simulation', () => {
  it('jump and hold glides longer than tapping', () => {
    const tap = new Run(1), hold = new Run(1);
    tap.input(true); hold.input(true); tap.step(); hold.step(); tap.input(false);
    for (let i = 0; i < 48; i++) { tap.step(); hold.step(); }
    expect(hold.y).toBeGreaterThan(tap.y);
  });
  it('replays identical input ticks deterministically', () => {
    const first = new Run(20), second = new Run(20);
    for (let t = 0; t < 5400; t++) {
      if (t % 120 === 0) first.input(true);
      if (t % 120 === 70) first.input(false);
      first.step();
    }
    for (let t = 0; t < 5400; t++) {
      for (const event of first.inputs.filter(e => e.tick === t)) second.input(event.held);
      second.step();
    }
    expect(second.score).toBe(first.score); expect(second.x).toBe(first.x); expect(second.lives).toBe(first.lives);
  });
  it('ends at 90 seconds and awards finish once', () => {
    const run = new Run(1); run.shield = 1000;
    for (let i = 0; i < DURATION / DT; i++) run.step();
    expect(run.won).toBe(true); expect(run.time).toBe(90);
    const score = run.score; run.step(); expect(run.score).toBe(score);
  });
  it('fall recovery does not award teleport distance points', () => {
    const run = new Run(1); run.x = 29;
    run.damage(true); expect(run.x).toBeGreaterThan(29); expect(run.score).toBe(0);
    expect(run.lives).toBe(2);
  });
  it('recovers on the actual height of a nonzero base platform', () => {
    const r=new Run(7), base=r.course.platforms.find(p=>!p.upper && p.y!==0)!;
    r.x=base.x-0.3; r.y=base.y-6;
    r.step(); expect(r.y).toBe(base.y); expect(r.grounded).toBe(true); expect(r.lives).toBe(2);
    expect(r.distance).toBeLessThan(0.2);
  });
  it('invulnerability prevents repeated damage and zero lives ends run', () => {
    const run = new Run(1); run.damage(); run.damage(); expect(run.lives).toBe(2);
    run.invincible = 0; run.damage(); run.invincible = 0; run.damage(); expect(run.finished).toBe(true);
  });
  it('can glide across every generated gap with the unchanged jump physics', () => {
    for (let seed=0;seed<30;seed++) {
      const bases=makeCourse(seed).platforms.filter(p=>!p.upper);
      for(let i=1;i<bases.length;i++) {
        const r=new Run(seed), edge=bases[i-1].x+bases[i-1].width;
        r.x=edge-0.7; r.y=bases[i-1].y; r.course.obstacles.length=0; r.course.items.length=0;
        r.input(true);
        for(let t=0;t<120 && r.x<bases[i].x+1;t++)r.step();
        expect(r.lives).toBe(3); expect(r.y).toBeGreaterThanOrEqual(bases[i].y);
      }
    }
  });
  it('lands on raised platforms and keeps the safe floor available', () => {
    const r=new Run(1); const p=r.course.platforms.find(p=>p.upper)!;
    r.x=p.x+1; r.y=p.y+0.02; r.vy=-2; r.grounded=false;
    r.step(); expect(r.y).toBe(p.y); expect(r.grounded).toBe(true);
    const base=r.terrainHeight;
    r.y=base; r.vy=0; r.step(); expect(r.y).toBe(base); expect(r.lives).toBe(3);
  });
  it('roof allows running underneath but damages a jumping player', () => {
    const r=new Run(5), roof=r.course.obstacles.find(o=>o.ceiling)!;
    r.x=roof.x-0.2; r.y=r.terrainHeight; r.step(); expect(r.lives).toBe(3);
    r.y=r.terrainHeight+1; r.step(); expect(r.lives).toBe(2);
  });
  it('shield attracts nearby notes only once', () => {
    const r=new Run(1); r.course.items.length=0;
    r.course.items.push({x:1.8,y:1,value:200,taken:false}); r.shield=5;
    r.step(); expect(r.pickupScore).toBe(200); r.step(); expect(r.pickupScore).toBe(200);
  });
  it('keeps early sections simple but increases late obstacle density', () => {
    for(let seed=0;seed<50;seed++) {
      const c=makeCourse(seed);
      const early=c.sections.filter(s=>s.x<112);
      for(const s of early) expect(c.obstacles.filter(o=>o.x>s.x && o.x<s.end).length).toBe(1);
      const late=c.sections.filter(s=>s.x>=600);
      expect(late.every(s=>s.kind!=='rest')).toBe(true);
      for(const s of late.filter(s=>s.kind==='jump')) expect(c.obstacles.filter(o=>o.x>s.x && o.x<s.end).length).toBe(3);
    }
  });
  it('changes height on every late landing and tightens late jump combinations', () => {
    for(let seed=0;seed<100;seed++) {
      const c=makeCourse(seed), base=c.platforms.filter(p=>!p.upper);
      for(let i=1;i<base.length;i++) {
        if(base[i-1].x+base[i-1].width>=315) expect(Math.abs(base[i].y-base[i-1].y)).toBeCloseTo(0.9);
      }
      for(const s of c.sections.filter(s=>s.x>=315)) {
        expect(s.kind).not.toBe('rest');
        const floor=base.find(p=>p.x>s.x && p.x<s.end)!;
        const groundSpikes=c.obstacles.filter(o=>!o.ceiling && o.y===floor.y && o.x>floor.x && o.x<s.end);
        if(s.kind==='glide') expect(groundSpikes.length).toBe(2);
        if(s.kind==='jump') {
          expect(groundSpikes.length).toBe(s.x>=600?3:2);
          expect(floor.width).toBeLessThan(s.x>=600?34:26);
          expect(groundSpikes[1].x-groundSpikes[0].x).toBeCloseTo(8);
        }
      }
    }
  });
  it('provides a damage-free short-jump route through every platform at maximum speed', () => {
    for(let seed=0;seed<20;seed++) {
      const sections=makeCourse(seed).sections;
      for(const section of sections) {
        const r=new Run(seed);
        const floor=r.course.platforms.find(p=>!p.upper && p.x>section.x && p.x<section.end)!;
        r.tick=4800; r.x=floor.x+0.2; r.y=floor.y; r.course.items.length=0;
        while(r.x<section.end-0.8 && !r.finished) {
          const spike=r.course.obstacles.find(o=>!o.ceiling && o.y===floor.y && o.x>r.x && o.x-r.x<2.5);
          r.input(Boolean(spike && r.grounded && !r.held)); r.step();
        }
        expect(r.lives,`seed=${seed}, kind=${section.kind}, x=${floor.x}`).toBe(3);
      }
    }
  });
  it('requires 24 notes for only 2.5 seconds of protection', () => {
    const r=new Run(1); r.course.items.length=0;
    r.collected=SHIELD_NOTES-2;
    r.course.items.push({x:0.2,y:0.8,value:100,taken:false}); r.step(); expect(r.shield).toBe(0);
    r.course.items.push({x:0.4,y:0.8,value:100,taken:false}); r.step(); expect(r.shield).toBe(SHIELD_SECONDS);
  });
  it('has a full-run no-shield route including gap-to-obstacle transitions', () => {
    for(let seed=0;seed<30;seed++) {
      const r=new Run(seed); r.course.items.length=0;
      let glideUntil=0;
      while(!r.finished) {
        const floor=r.course.platforms.find(p=>!p.upper && r.x>=p.x && r.x<=p.x+p.width);
        const edge=floor ? floor.x+floor.width : Infinity;
        if(r.grounded && edge-r.x<1.3) {
          glideUntil=r.course.platforms.find(p=>!p.upper && p.x>edge)!.x+0.5;
        }
        const spike=r.course.obstacles.find(o=>!o.ceiling && o.y===r.terrainHeight && o.x>r.x && o.x-r.x<2.5);
        r.input(r.x<glideUntil || Boolean(spike && r.grounded && !r.held));
        r.step();
      }
      expect(r.won,`seed=${seed} x=${r.x}`).toBe(true);
      expect(r.lives,`seed=${seed}`).toBe(3);
    }
  });
});
