import {it,expect} from 'vitest';
import {Run} from './simulation';
import {runReport,validDuration} from './platform';
it('preserves same-tick edges without mutating the run',()=>{
 const run=new Run(42);run.inputs.push({tick:1,held:true},{tick:1,held:false},{tick:2,held:true});
 const before=JSON.stringify(run);const report=runReport(run);
 expect(report.inputs).toEqual([{tick:1,held:true},{tick:1,held:false},{tick:2,held:true}]);
 expect(report.score).toBe(report.metrics!.distance_score+report.metrics!.pickup_score+report.metrics!.completion_bonus);
 expect(runReport(run,false).inputs).toBeUndefined();expect(JSON.stringify(run)).toBe(before);
});
it('does not silently accept a duration unsupported by the frozen game rules',()=>{
 expect(validDuration(90000)).toBe(true);expect(validDuration(30000)).toBe(false);
});
