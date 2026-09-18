// Short synthesized cues; no downloads and no sound before a user gesture.
export class AudioCues {
  private context?: AudioContext;
  muted = false;
  unlock() {
    try { this.context ??= new AudioContext(); void this.context.resume().catch(() => {}); } catch { /* Silent fallback in restricted WebViews. */ }
  }
  play(kind: 'jump' | 'coin' | 'hurt' | 'phase' | 'shield') {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running' || this.muted) return;
    const notes = { jump:[280,480], coin:[700,1100], hurt:[160,55], phase:[420,620], shield:[620,1300] }[kind];
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    const now = ctx.currentTime, duration = kind === 'hurt' ? 0.2 : 0.12;
    osc.type = kind === 'hurt' ? 'sawtooth' : 'sine';
    osc.frequency.setValueAtTime(notes[0],now); osc.frequency.exponentialRampToValueAtTime(notes[1],now+duration);
    gain.gain.setValueAtTime(0,now); gain.gain.linearRampToValueAtTime(0.055,now+0.008); gain.gain.exponentialRampToValueAtTime(0.001,now+duration);
    osc.connect(gain); gain.connect(ctx.destination); osc.start(now); osc.stop(now+duration+0.01);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
}
