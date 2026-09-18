import { Run, DT, DURATION, RULES, SHIELD_NOTES } from './simulation';
import './style.css';
import './embed.css';
import { AudioCues } from './audio';
import { Paper2D } from './paper2d';

const params = new URLSearchParams(location.search);
// Layout only: embedding does not grant a session or enable trusted scoring.
const embedded = params.get('embed') === '1';
document.documentElement.classList.toggle('embedded', embedded);
const routeSeed = params.get('seed');
const previewSeed = routeSeed !== null && /^\d{1,10}$/.test(routeSeed) && Number(routeSeed) <= 0xffffffff ? Number(routeSeed) : 42;

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
<header><a class="wordmark" href="#">P2L <span>/ PAPERHOOD</span></a><span class="tag">INDEPENDENT GAME · PRACTICE</span></header>
<main><div class="heading"><div><p class="eyebrow">BUY HIGH. JUMP HIGHER.</p><h1>Outrun the <em>red.</em></h1></div><p class="intro">A paper-thin chance.<br>A diamond-handed finish.</p></div>
<section class="game" aria-label="PAPERHOOD runner"><div id="viewport"></div>
<div class="hud"><div><small>SCORE</small><strong id="score">00000</strong></div><div class="hud-center"><small id="phase">OPENING BELL</small><div class="progress"><i id="progress"></i></div></div><div class="right"><small id="clock">90s</small><strong id="lives" aria-label="3 lives">◆ ◆ ◆</strong></div><button id="pause" aria-label="Pause game" disabled>Ⅱ</button></div>
<div id="damage-flash" aria-hidden="true"></div><div id="callout" aria-live="polite"></div><div id="route-hint"></div><button id="sound" aria-label="Mute sound" aria-pressed="false">SOUND ON</button>
<div class="status"><span id="combo">COLLECT · BUILD YOUR MULTIPLIER</span><span id="seed"></span></div>
<div class="overlay" id="overlay"><div class="panel"><p class="eyebrow" id="panel-tag">PAPER RUN / 01</p><h2 id="panel-title">Small hands.<br>Big escape.</h2><p id="panel-copy">Jump the red spikes. Glide across the gaps.<br>Three lives. Ninety seconds. A new route every run.</p><button class="primary" id="start">LET’S RUN <span>↗</span></button><button class="secondary" id="replay" hidden>Replay this route</button><p class="fine">Practice only · No activity points or real rewards</p></div></div>
</section><div class="controls"><div><b>01 / TAP</b><span>Jump over trouble</span></div><div><b>02 / HOLD</b><span>Open your paper cape & glide</span></div><div><b>03 / RELEASE</b><span>Drop onto a safe landing</span></div><button id="jump">HOLD TO GLIDE <span>↑</span></button></div><footer><span>SPACE / POINTER · ESC TO PAUSE</span><span id="version"></span></footer></main>`;
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const viewport = el('viewport');
if (embedded) {
  el('panel-copy').innerHTML = 'Tap or press Space to jump.<br>Hold to glide · Release to land.';
}
const audio = new AudioCues();
el('sound').onclick = () => { audio.unlock(); audio.muted = !audio.muted; el('sound').textContent = audio.muted ? 'SOUND OFF' : 'SOUND ON'; el('sound').setAttribute('aria-pressed', String(audio.muted)); el('sound').setAttribute('aria-label', audio.muted ? 'Unmute sound' : 'Mute sound'); };
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const paper2d = new Paper2D(reducedMotion);
if (paper2d) {
  el<HTMLButtonElement>('start').disabled = true;
  el('start').textContent = 'LOADING PAPER WORLD…';
  void paper2d.art.ready.then(complete => {
    el<HTMLButtonElement>('start').disabled = false;
    el('start').textContent = 'LET’S RUN ↗';
    if (!complete) el('panel-copy').textContent = 'Some artwork could not load. You can still play with the lightweight visuals, or refresh to retry.';
  });
}
viewport.append(paper2d.canvas);
let run = new Run(previewSeed), active = false, paused = false;
let lastCollected = 0, lastLives = 3, lastShield = false, lastPhase = -1, feedback = 0, flash = 0;
function announce(text: string) { el('callout').textContent = text; feedback = 2.3; }
function seed() { return crypto.getRandomValues(new Uint32Array(1))[0]; }
function start(s = seed()) {
  audio.unlock(); lastCollected = 0; lastLives = 3; lastShield = false; lastPhase = -1; flash = 0;
  paper2d.reset();
  run = new Run(s); active = true; paused = false; accumulator = 0;
  el('overlay').hidden = true; el<HTMLButtonElement>('pause').disabled = false;
  el('pause').textContent = 'Ⅱ'; el('seed').textContent = `ROUTE ${s.toString(16).toUpperCase()}`;
  el('jump').focus({preventScroll:true});
}
function togglePause() {
  if (!active || run.finished) return;
  paused = !paused; run.input(false); accumulator = 0;
  el('pause').textContent = paused ? '▶' : 'Ⅱ'; el('overlay').hidden = !paused;
  if (paused) {
    el('panel-tag').textContent = 'TAKE A BREATH'; el('panel-title').textContent = 'Market paused.';
    el('panel-copy').textContent = 'Your run is waiting. Resume when you are ready.';
    el('start').textContent = 'RESUME →'; el('replay').hidden = true; el('start').focus();
  }
}
function finish() {
  active = false; run.input(false); el('overlay').hidden = false;
  el<HTMLButtonElement>('pause').disabled = true;
  el('panel-tag').textContent = run.won ? 'CLOSING BELL / SURVIVED' : 'LIQUIDATED / TRY AGAIN';
  el('panel-title').textContent = run.score.toLocaleString() + ' PTS';
  el('panel-copy').textContent = `${run.time.toFixed(1)} seconds · ${run.collected} notes collected. Practice score only — not submitted to P2L.`;
  el('start').textContent = 'NEW ROUTE ↗'; el('replay').hidden = false; el('start').focus();
}
let firstStart = true;
el('start').onclick = () => { if (paused) togglePause(); else { start(firstStart && routeSeed !== null ? previewSeed : seed()); firstStart = false; } };
el('replay').onclick = () => start(run.seed);
el('pause').onclick = togglePause;
el('version').textContent = RULES;
const press = () => { if (active && !paused) { if (!run.held && run.grounded) audio.play('jump'); run.input(true); } };
const release = () => run.input(false);
for (const target of [viewport, el('jump')]) {
  target.addEventListener('contextmenu', e => e.preventDefault());
  target.addEventListener('selectstart', e => e.preventDefault());
  target.addEventListener('pointerdown', e => { if (e.button !== 0) return; e.preventDefault(); target.setPointerCapture(e.pointerId); press(); });
  target.addEventListener('pointerup', release); target.addEventListener('pointercancel', release); target.addEventListener('lostpointercapture', release);
}
window.addEventListener('keydown', e => {
  if (e.code === 'Escape') { togglePause(); return; }
  if (e.code === 'Space' && active && !paused) { e.preventDefault(); if (!e.repeat) press(); }
});
window.addEventListener('keyup', e => { if (e.code === 'Space') release(); });
window.addEventListener('blur', () => { release(); if (active && !paused) togglePause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && active && !paused) togglePause(); });
function resize() { paper2d.resize(viewport.clientWidth, viewport.clientHeight); }
new ResizeObserver(resize).observe(viewport);
let previous = performance.now(), accumulator = 0;
function frame(now: number) {
  requestAnimationFrame(frame);
  const delta = Math.min((now-previous)/1000,0.1); previous = now;
  if (active && !paused) { accumulator += delta; while (accumulator >= DT && !run.finished) { run.step(); accumulator -= DT; } if (run.finished) finish(); }
  const x = run.x;
  const playing = active && !paused;
  if (playing) {
    feedback = Math.max(0,feedback-delta); flash = Math.max(0,flash-delta);
    if (run.collected > lastCollected) { audio.play('coin'); lastCollected = run.collected; }
    if (run.lives < lastLives) { audio.play('hurt'); flash = 0.35; lastLives = run.lives; if (!reducedMotion) navigator.vibrate?.(35); }
    if (run.shield > 0 && !lastShield) { audio.play('shield'); announce('DIAMOND HANDS · MAGNET + SHIELD'); }
    lastShield = run.shield > 0;
    const phase = run.time < 15 ? 0 : run.time < 40 ? 1 : run.time < 70 ? 2 : 3;
    if (phase !== lastPhase) { lastPhase = phase; announce(['OPENING BELL · FIND YOUR RHYTHM','BULL RUN · TAKE THE HIGH ROAD','VOLATILITY · WATCH YOUR LANDING','FINAL 20 SECONDS · HOLD YOUR NERVE'][phase]); audio.play('phase'); }
  }
  el('callout').style.opacity = playing && feedback > 0 ? '1' : '0';
  el('damage-flash').style.opacity = String(reducedMotion ? 0 : flash);
  const nextSection = run.course.sections.find(s => s.end > x && s.x < x+22);
  const hints = {jump:'SHORT JUMPS · LAND, THEN TAP AGAIN',glide:'GLIDE THE GAP · RELEASE BEFORE THE SPIKE',choice:'HIGH ROAD · DOUBLE NOTES / LOW ROAD · JUMP TO EXIT',tunnel:'JUMP → RELEASE UNDER ROOF → JUMP',rest:'BREATHER · RESET YOUR RHYTHM'};
  const nextFloor = run.course.platforms.find(p=>!p.upper && p.x>x && p.x-x<14);
  const terrainHint = nextFloor && Math.abs(nextFloor.y-run.terrainHeight)>0.1 ? (nextFloor.y>run.terrainHeight?'UPHILL · JUMP TO THE HIGHER LEDGE':'DOWNHILL · CONTROL YOUR LANDING') : '';
  el('route-hint').textContent = active && nextSection ? terrainHint || hints[nextSection.kind] : '';
  el('score').textContent = run.score.toString().padStart(5,'0');
  el('clock').textContent = `${Math.max(0,Math.ceil(DURATION-run.time))}s`;
  el('lives').textContent = '◆ '.repeat(Math.max(0,run.lives))+'◇ '.repeat(3-Math.max(0,run.lives));
  el('lives').setAttribute('aria-label', `${run.lives} lives`);
  el('progress').style.width = `${run.time/DURATION*100}%`;
  el('phase').textContent = run.time < 15 ? 'OPENING BELL' : run.time < 40 ? 'BULL RUN' : run.time < 70 ? 'VOLATILE MARKET' : 'FINAL ESCAPE';
  el('combo').textContent = run.shield > 0 ? `DIAMOND HANDS · ${run.shield.toFixed(1)}s` : `×${run.multiplier} · ${run.combo} STREAK · SHIELD ${run.collected % SHIELD_NOTES}/${SHIELD_NOTES}`;
  paper2d.draw(run, delta, !playing);
}
resize(); requestAnimationFrame(frame);
