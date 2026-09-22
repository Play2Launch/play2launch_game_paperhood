import { describe, expect, it } from 'vitest';
import { Run, DT, DURATION, FINISH_X, makeCourse, SHIELD_NOTES, SHIELD_SECONDS, obstaclePosition } from './simulation';

describe('seeded course', () => {
  it('varies adjacent moving hazards without changing deterministic generation', () => {
    for(let seed=0;seed<50;seed++) {
      const c=makeCourse(seed);
      const movers=c.obstacles.filter(o=>o.motion?.axis==='x');
      expect(new Set(movers.map(o=>o.motion!.period)).size).toBe(movers.length);
      expect(new Set(movers.map(o=>o.motion!.phase)).size).toBe(movers.length);
      for(const o of movers) {
        expect(o.motion!.period).toBeGreaterThanOrEqual(1.7);
        expect(o.motion!.period).toBeLessThan(3.31);
        expect(o.motion!.amplitude).toBeLessThanOrEqual(.65);
      }
      expect(makeCourse(seed)).toEqual(c);
    }
  });
  it('moves late rewards onto optional risk lines without inflating their count or value', () => {
    for(let seed=0;seed<50;seed++) {
      const c=makeCourse(seed);
      expect(c.items.filter(i=>i.value===100)).toHaveLength(110);
      expect(c.items.filter(i=>i.value===200)).toHaveLength(c.sections.filter(s=>s.kind==='choice').length*4);
      expect(c.items.some(i=>i.risky)).toBe(true);
      for(const section of c.sections.filter(s=>s.x>=381 && s.x<730 && s.kind!=='rest')) {
        const risky=c.items.filter(i=>i.risky && i.x>section.x && i.x<section.end);
        expect(risky.length).toBeGreaterThan(0);
        expect(new Set(risky.map(i=>i.x)).size).toBe(risky.length);
        for(const item of risky) {
          expect(item.value).toBe(100);
          expect(c.obstacles.some(o=>o.ceiling && o.x>item.x && o.x-item.x<3.3)).toBe(true);
        }
      }
    }
  });
  it('pairs vertical and horizontal hazards on every active section after 50 seconds', () => {
    for(let seed=0;seed<100;seed++) {
      const c=makeCourse(seed);
      for(const section of c.sections.filter(s=>s.x>=381 && s.kind!=='rest')) {
        const hazards=c.obstacles.filter(o=>o.x>section.x && o.x<section.end);
        const roofs=hazards.filter(o=>o.motion?.axis==='y');
        expect(roofs.length).toBeGreaterThanOrEqual(section.kind==='jump' && section.x>=551 ? 2 : 1);
        expect(hazards.some(o=>o.motion?.axis==='x')).toBe(true);
        for(const roof of roofs) {
          for(const spike of hazards.filter(o=>o.motion?.axis==='x')) {
            // Swept horizontal footprints cannot overlap into a vertical clamp.
            expect(Math.abs(roof.x-spike.x)).toBeGreaterThan(1.2+.65+spike.motion!.amplitude);
          }
        }
      }
    }
  });
  it('introduces bounded moving hazards from 40% progress and leaves roof clearance', () => {
    for (let seed=0; seed<100; seed++) {
      const c = makeCourse(seed);
      const moving = c.obstacles.filter(o=>o.motion);
      expect(moving.some(o=>o.motion!.axis==='x')).toBe(true);
      expect(moving.some(o=>o.motion!.axis==='y')).toBe(true);
      expect(moving.some(o=>o.x<381)).toBe(true);
      expect(Math.min(...moving.map(o=>o.x))).toBeLessThan(310);
      expect(c.obstacles.filter(o=>o.x>=268.2 && !o.ceiling && !o.motion).every(o=>{
        const floor=c.platforms.find(p=>!p.upper && o.x>=p.x && o.x<=p.x+p.width)!;
        return o.y>floor.y || !!o.height || !!floor.precision;
      })).toBe(true);
      for (const o of moving) {
        expect(o.x).toBeGreaterThanOrEqual(268.2);
        const floor=c.platforms.find(p=>!p.upper && o.x>=p.x && o.x<=p.x+p.width)!;
        for (let t=0;t<6;t+=.1) {
          const pos=obstaclePosition(o,t);
          expect(pos.x).toBeGreaterThan(floor.x+5);
          expect(pos.x).toBeLessThan(floor.x+floor.width-5);
          if (o.ceiling) expect(pos.y-floor.y).toBeGreaterThan(1.9);
          if (o.motion!.axis==='x') expect(pos.y).toBe(o.y);
          expect(obstaclePosition(o,t)).toEqual(pos);
        }
      }
    }
  }, 15000);
  it('uses the moving position for collision rather than its stationary anchor', () => {
    const r=new Run(1); r.course.obstacles.length=0; r.course.items.length=0;
    const o={x:1.1,y:0,hit:false,motion:{axis:'x' as const,amplitude:1,period:4,phase:-Math.PI/2}};
    r.course.obstacles.push(o);
    expect(Math.abs(o.x-r.x)).toBeGreaterThan(.65);
    r.step(); expect(o.hit).toBe(true); expect(r.lives).toBe(2);
    const position=obstaclePosition(o,r.time);
    expect(obstaclePosition(o,r.time)).toEqual(position);
  });
  it('awards the finish seal once, without combo multiplication or automatic win points', () => {
    const r = new Run(42); r.course.obstacles.length = 0; r.course.items.length = 0;
    r.combo = 24;
    r.course.items.push({x: .2, y: .8, taken: false, value: 2000, finish: true});
    r.step();
    expect(r.finishCollected).toBe(true);
    expect(r.score - Math.floor(r.distance * 10)).toBe(2000);
    expect(r.pickupScore).toBe(0); expect(r.collected).toBe(0); expect(r.combo).toBe(24);
    r.step(); expect(r.score - Math.floor(r.distance * 10)).toBe(2000);
    const missed = new Run(42); missed.won = true;
    expect(missed.score).toBe(0);
  });
  it('places one permanent seal at the 89-second position without late spawning', () => {
    const r = new Run(42);
    const original = r.course.items.find(i => i.finish)!;
    expect(original.x).toBe(FINISH_X);
    expect(FINISH_X).toBe(640+9*(89-80));
    r.tick = 88 / DT - 1; r.x = 712;
    r.y = r.terrainHeight; r.invincible = 10;
    r.step(); r.step();
    const seals = r.course.items.filter(i => i.finish);
    expect(seals).toHaveLength(1);
    expect(seals[0]).toBe(original);
    expect(seals[0].x).toBeGreaterThan(712);
    expect(seals[0].x).toBeLessThan(730);
  });
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
        expect(p.width).toBeGreaterThanOrEqual(p.precision ? 4 : 15);
      }
      for (const o of c.obstacles) expect(base.some(p => o.x > p.x+(p.precision?1.5:6) && o.x < p.x+p.width-(p.precision?1.5:6))).toBe(true);
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
        expect(base[i].y).toBeGreaterThanOrEqual(-1.81); expect(base[i].y).toBeLessThanOrEqual(base[i].precision?3.31:2.71);
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
  it('breaks combo once on a missed note without damage, then restarts at one', () => {
    const r=new Run(1); r.course.items.length=0; r.course.obstacles.length=0;
    r.combo=16; r.shield=5;
    r.course.items.push({x:-3,y:.8,value:100,taken:false});
    r.step(); expect(r.combo).toBe(0); expect(r.multiplier).toBe(1);
    expect(r.lives).toBe(3); expect(r.comboBreaks).toBe(1); expect(r.lastComboBreak).toBe('miss');
    r.course.items.push({x:r.x+.2,y:.8,value:100,taken:false});
    r.step(); expect(r.combo).toBe(1); expect(r.pickupScore).toBe(100);
    r.step(); expect(r.comboBreaks).toBe(1);
  });
  it('counts missed risk notes but exempts unchosen branches and finish rewards', () => {
    for(const extra of [{risky:true},{optional:true},{finish:true}]) {
      const r=new Run(1); r.course.items.length=0; r.combo=8;
      r.course.items.push({x:-3,y:.8,value:100,taken:false,...extra});
      r.step(); expect(r.combo).toBe('risky' in extra ? 0 : 8);
    }
  });
  it('requires a held jump over a tall block and a release before the low roof', () => {
    const tryRoute=(mode:'tap'|'hold'|'mixed')=>{
      const r=new Run(1); r.tick=4800; r.x=3.7;
      r.course.items.length=0; r.course.platforms.splice(0,r.course.platforms.length,{x:0,width:40,y:0});
      r.course.obstacles.splice(0,r.course.obstacles.length,{x:7.5,y:0,height:1.7,halfWidth:1.25,hit:false},{x:13,y:2.25,ceiling:true,hit:false});
      r.input(true); r.step();
      while(r.x<18) { r.input(mode==='hold' || (mode==='mixed' && r.x<9)); r.step(); }
      return r.lives;
    };
    expect(tryRoute('mixed')).toBe(3);
    expect(tryRoute('tap')).toBeLessThan(3);
    expect(tryRoute('hold')).toBeLessThan(3);
  });
  it('makes late islands real gaps with an obstacle and room on both sides', () => {
    for(let seed=0;seed<100;seed++) {
      const c=makeCourse(seed);
      for(const section of c.sections.filter(s=>s.x>=551 && s.kind==='rest')) {
        const islands=c.platforms.filter(p=>p.x>section.x && p.x<section.end);
        expect(islands).toHaveLength(3);
        expect(islands.every(p=>p.precision && p.width>=4)).toBe(true);
        expect(islands[1].x-islands[0].x-islands[0].width).toBeCloseTo(2);
        const o=c.obstacles.find(o=>o.x>islands[1].x && o.x<islands[1].x+islands[1].width)!;
        expect(o.halfWidth).toBe(.4);
        expect(o.x-islands[1].x).toBeGreaterThan(1.5);
        expect(islands[1].x+islands[1].width-o.x).toBeGreaterThan(1.5);
      }
    }
  });
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
      expect(late.some(s=>s.kind==='rest')).toBe(true);
      for(const s of late.filter(s=>s.kind==='jump')) expect(c.obstacles.filter(o=>!o.ceiling && o.x>s.x && o.x<s.end).length).toBe(3);
    }
  });
  it('changes height on every late landing and tightens late jump combinations', () => {
    for(let seed=0;seed<100;seed++) {
      const c=makeCourse(seed), base=c.platforms.filter(p=>!p.upper);
      for(let i=1;i<base.length;i++) {
        const section=c.sections.find(s=>base[i].x>s.x && base[i].x<s.end)!;
        if(section.x>=230 && section.kind!=='rest') expect(Math.abs(base[i].y-base[i-1].y)).toBeCloseTo(0.9);
      }
      for(const s of c.sections.filter(s=>s.x>=381)) {
        const floor=base.find(p=>p.x>s.x && p.x<s.end)!;
        const groundSpikes=c.obstacles.filter(o=>!o.ceiling && o.y===floor.y && o.x>floor.x && o.x<s.end);
        if(s.kind==='glide') expect(groundSpikes.length).toBe(2);
        if(s.kind==='jump') {
          expect(groundSpikes.length).toBe(s.x>=551?3:2);
          expect(floor.width).toBeLessThan(s.x>=551?33:25);
          expect(groundSpikes[1].x-groundSpikes[0].x).toBeCloseTo(7.5);
        }
      }
    }
  });
  it('preserves the introductory short-jump route before mixed-hold obstacles', () => {
    for(let seed=0;seed<20;seed++) {
      const sections=makeCourse(seed).sections;
      for(const section of sections.filter(s=>s.x<381)) {
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
      let solved=false, failure='';
      for(const takeoff of [1.3,2,3]) for(const landingLead of [-2.5,-1.5,-.5,.5]) {
      if(solved) continue;
      const r=new Run(seed); r.course.items.length=0;
      let glideUntil=0;
      while(!r.finished && r.lives===3) {
        const floor=r.course.platforms.find(p=>!p.upper && r.x>=p.x && r.x<=p.x+p.width);
        const edge=floor ? floor.x+floor.width : Infinity;
        if(r.grounded && edge-r.x<(floor?.precision ? 1.3 : takeoff)) {
          const next=r.course.platforms.find(p=>!p.upper && p.x>edge)!;
          const skip=next.precision && r.course.obstacles.some(o=>o.x>next.x && o.x<next.x+next.width)
            ? r.course.platforms.find(p=>!p.upper && p.x>next.x+next.width) : undefined;
          glideUntil=skip ? skip.x+.5 : next.x+(next.precision ? landingLead : .5);
        }
        const tall=r.course.obstacles.find(o=>o.height && o.x>r.x && o.x-r.x<3.8);
        if(tall && r.grounded) glideUntil=tall.x+(tall.halfWidth??.65)+.2;
        const spike=r.course.obstacles.find(o=>!o.ceiling && !o.height && o.y===r.terrainHeight && o.x>r.x && o.x-r.x<2.5);
        r.input(r.x<glideUntil || Boolean(spike && r.grounded && !r.held));
        r.step();
      }
      solved=r.won && r.lives===3;
      failure=`x=${r.x} y=${r.y} t=${r.time} hazards=${JSON.stringify(r.course.obstacles.filter(o=>Math.abs(o.x-r.x)<3))}`;
      }
      expect(solved,`no mixed-input no-shield route found for seed=${seed}; ${failure}`).toBe(true);
    }
  },30000);
});
