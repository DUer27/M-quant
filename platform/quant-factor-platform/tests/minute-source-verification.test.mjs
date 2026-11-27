import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createMinuteSourceVerification} from '../minute-source-verification.mjs';
function fixture(){
  const root=mkdtempSync(join(tmpdir(),'source-verification-')),directory=join(root,'outputs/live-market-data/intraday-trial/minute-boundary-observations');mkdirSync(directory,{recursive:true});
  let now=new Date('2026-11-25T13:00:00Z');const status={automatic_enabled:false,minute_codes:['000001','600519'],minute_audit:{codes:['000001']}};
  const policy=createMinuteSourceVerification({projectRoot:root,now:()=>now});return {root,directory,policy,status,setNow:v=>{now=new Date(v);}};
}
test('exchange references do not establish source semantics or enable strategy use',()=>{
  const f=fixture(),result=f.policy.summary(f.status);assert.equal(result.exchange_session_rule,'reference_checked');
  assert.equal(result.label_semantics,'unverified');assert.equal(result.closure_rule,'unverified');assert.equal(result.strategy_eligible,false);
  assert.equal(result.intraday_deliveries,0);assert.equal(result.evidence_state,'awaiting_intraday_observations');
  assert.ok(result.references.every(r=>r.does_not_establish));assert.equal(result.automatic_enabled,false);
});
test('saved response imports remain distinct from genuine intraday evidence',()=>{
  const f=fixture();writeFileSync(join(f.directory,'2026-11-25.json'),JSON.stringify({stocks:[{code:'000001',day:'2026-11-25',deliveries:1,intraday_deliveries:0,phase_counts:{},recent:[{origin:'imported_saved_delivery',labels:[{label:'fixture'}]}]}]}));
  const result=f.policy.summary(f.status);assert.equal(result.deliveries,1);assert.equal(result.intraday_deliveries,0);
  assert.equal(result.stocks[0].recent[0].labels,undefined);assert.equal(result.stocks[0].recent[0].stored_labels,1);
  assert.equal(f.policy.detail('000001',f.status).recent[0].labels.length,1);
});
test('old days and removed samples cannot appear as current selected evidence',()=>{
  const f=fixture();writeFileSync(join(f.directory,'2026-11-25.json'),JSON.stringify({stocks:[{code:'600519',day:'2026-11-25',deliveries:10,intraday_deliveries:10,recent:[]}]}));
  assert.equal(f.policy.summary(f.status).intraday_deliveries,0);assert.equal(f.policy.detail('600519',f.status),null);
  assert.equal(f.policy.detail('../bad',f.status),null);f.setNow('2026-11-26T02:00:00Z');assert.equal(f.policy.summary(f.status).deliveries,0);
});
test('unreadable export does not pretend to establish evidence',()=>{
  const f=fixture();writeFileSync(join(f.directory,'2026-11-25.json'),'invalid json');const result=f.policy.summary(f.status);
  assert.equal(result.evidence_state,'archive_error');assert.equal(result.strategy_eligible,false);assert.ok(result.read_error);
});
