// Freeze the rendering-independent simulation into the server binary.
// Run after intentional physics changes; --check detects stale artifacts.
import fs from 'node:fs';
import crypto from 'node:crypto';
import ts from 'typescript';
const source = new URL('../src/simulation.ts', import.meta.url);
const target = new URL('../../PlayToLaunch_server/gameprotocol/replay/paperhood-v5.js', import.meta.url);
const input = fs.readFileSync(source, 'utf8').replace(/\r\n/g, '\n');
const body = ts.transpileModule(input, {compilerOptions:{target:ts.ScriptTarget.ES2015,module:ts.ModuleKind.CommonJS}}).outputText;
const output = '// Generated from simulation.ts; SHA256 '+crypto.createHash('sha256').update(input).digest('hex')+'\nvar exports = {};\n'+body+`
function replayRunner(seed, inputs) {
  const run = new exports.Run(seed);
  let index = 0;
  while (!run.finished && run.tick < 5400) {
    while (index < inputs.length && inputs[index].tick === run.tick) {
      run.input(inputs[index].held); index++;
    }
    run.step();
  }
  if (!run.finished || index !== inputs.length) throw new Error('Incomplete or trailing input');
  return JSON.stringify({elapsed_ms:Math.round(run.time*1000),score:run.score,
    metrics:{distance:run.distance,collected:run.collected,pickup_score:run.pickupScore,
      lives:Math.max(0,run.lives),won:run.won?1:0,distance_score:Math.floor(run.distance*10),
      completion_bonus:run.finishCollected?2000:0,finish_collected:run.finishCollected?1:0},inputs});
}
`;
if (process.argv.includes('--check')) {
  if(fs.readFileSync(target,'utf8').replace(/\r\n/g, '\n')!==output)throw Error('Stale server simulation: run npm run replay:generate');
} else fs.writeFileSync(target,output);
