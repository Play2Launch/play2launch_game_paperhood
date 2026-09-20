import { createGameSDK, type GameSDK, type TestConfig, type Finish } from '@play2launch/game-sdk';
import { Run, DURATION, RULES } from './simulation';
declare global { interface Window { P2L_TEST_CONFIG?: TestConfig; } }
export function runReport(run: Run, withInputs = true): Finish {
  // Normalize same-tick transitions to their final held state; keep the original Run log untouched.
  const inputs = new Map(run.inputs.map(e => [e.tick, { ...e }]));
  return { elapsed_ms: Math.round(run.time * 1000), score: run.score,
    metrics: { distance: run.distance, collected: run.collected, pickup_score: run.pickupScore,
      lives: Math.max(0, run.lives), won: run.won ? 1 : 0, distance_score: Math.floor(run.distance * 10), completion_bonus: run.won ? 2000 : 0 },
    ...(withInputs ? {inputs: [...inputs.values()].sort((a,b)=>a.tick-b.tick)} : {}) };
}
export function validDuration(duration: number) { return duration === DURATION * 1000; }
export async function connectSDK(): Promise<GameSDK> {
  // Optional admin-generated config. No account credentials; missing file is fine for public demo.
  await new Promise<void>(resolve => {
    if (window.P2L_TEST_CONFIG) { resolve(); return; }
    const script = document.createElement('script'); let settled = false;
    const done = () => { if(settled)return;settled=true;clearTimeout(timer);script.onload=null;script.onerror=null;resolve(); };
    const timer=setTimeout(()=>{script.remove();done();},4000);
    script.src = `${import.meta.env.BASE_URL}p2l-config.js`; script.onload=done;script.onerror=done;document.head.append(script);
  });
  const testConfig=window.P2L_TEST_CONFIG;
  const allowed=(import.meta.env.VITE_P2L_PARENT_ORIGINS || 'http://127.0.0.1:5180,http://localhost:5180,http://127.0.0.1:5191,http://localhost:5173,http://127.0.0.1:5173').split(',').map((s:string)=>s.trim()).filter(Boolean);
  if(testConfig?.parent_origin && !allowed.includes(testConfig.parent_origin))allowed.push(testConfig.parent_origin);
  const requested=new URLSearchParams(location.search).get('parent_origin');
  const parentOrigin=requested && allowed.includes(requested) ? requested : allowed[0];
  if(requested && !allowed.includes(requested))throw Error('Parent origin is not allowed by this game deployment.');
  if(new URLSearchParams(location.search).get('mode')==='platform' && !testConfig)throw Error('Missing p2l-config.js. Download the game configuration from the admin console.');
  const gameId=testConfig?.game_id || 'standalone-demo';
  return createGameSDK({gameId,rulesVersion:RULES,
    parentOrigin,allowedParentOrigins:allowed,testConfig});
}
