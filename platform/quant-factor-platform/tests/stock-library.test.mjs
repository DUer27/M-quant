import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EventEmitter} from 'node:events';
import {createStockLibrary,validateStocks,effectiveConfig,snapshotConfig,readLibrary} from '../stock-library.mjs';
import {createIntradayTrial,recoveryQuality} from '../intraday-trial.mjs';
import {createMarketDataController} from '../market-data.mjs';

function fixture(){
  const root=mkdtempSync(join(tmpdir(),'stock-library-')),platform=join(root,'platform/quant-factor-platform');
  mkdirSync(join(platform,'config'),{recursive:true});mkdirSync(join(root,'outputs/live-market-data'),{recursive:true});
  writeFileSync(join(root,'pool.csv'),'code,name\n000001,平安银行\n000002,万科A\n');
  writeFileSync(join(platform,'config/intraday-trial.json'),JSON.stringify({automatic_enabled:true,codes:['000001','000002'],minute_audit_codes:['000001']}));
  writeFileSync(join(platform,'config/market-data.json'),JSON.stringify({enabled:true,symbols_file:'pool.csv',profile:'fixture',schedule_time:'18:30',completed_bar_after:'16:30',max_auto_attempts_per_slot:3,retry_interval_minutes:30}));
  writeFileSync(join(root,'outputs/live-market-data/calendar.json'),JSON.stringify({dates:['2026-11-25','2026-11-26']}));
  const library=createStockLibrary({projectRoot:root,platformRoot:platform});library.initialize();return{root,platform,library};
}
test('migration imports original choices once and seeds ten inactive known stocks',()=>{
  const f=fixture(),first=f.library.status();assert.equal(first.stocks.length,12);assert.equal(first.version,1);
  assert.equal(first.stocks.filter(s=>s.quote).length,2);assert.equal(first.stocks.filter(s=>s.audit).length,1);
  assert.equal(first.stocks.find(s=>s.code==='600519').quote,false);assert.equal(f.library.initialize().id,first.id);
});
test('preview does not publish, optimistic saves reject stale editors and rollback creates a new version',()=>{
  const f=fixture(),initial=f.library.status();const draft=initial.stocks.map(s=>({...s}));
  draft.find(s=>s.code==='000002').quote=false;draft.find(s=>s.code==='000002').minute=false;
  Object.assign(draft.find(s=>s.code==='600519'),{quote:true,minute:true});
  const preview=f.library.preview(draft,1);assert.equal(preview.changes.length,2);assert.equal(f.library.status().version,1);
  const sentinel=join(f.root,'outputs/live-market-data/cache');mkdirSync(sentinel);writeFileSync(join(sentinel,'000002.csv'),'historic-data');
  assert.equal(f.library.save(draft,1).library.version,2);assert.throws(()=>f.library.save(draft,1),/已被其他操作更新/);
  assert.equal(f.library.restore(1,2).library.version,3);assert.equal(f.library.status().stocks.find(s=>s.code==='000002').quote,true);
  assert.equal(readFileSync(join(sentinel,'000002.csv'),'utf8'),'historic-data');
});
test('validation checks supported codes, duplicates, dependent switches and capacities',()=>{
  const f=fixture(),stocks=f.library.status().stocks;
  assert.throws(()=>validateStocks([...stocks,stocks[0]]),/重复/);
  assert.throws(()=>validateStocks(stocks.map((s,i)=>i? s:{...s,code:'830001'})),/不支持/);
  assert.throws(()=>validateStocks(stocks.map((s,i)=>i? s:{...s,quote:false})),/分钟采集需要/);
  assert.throws(()=>validateStocks(stocks.map(s=>({...s,daily:false}))),/日线池至少/);
  const many=Array.from({length:51},(_,i)=>({code:String(i+1).padStart(6,'0'),name:'fixture',daily:true,quote:true,minute:true,audit:false,priority:1}));
  assert.throws(()=>validateStocks(many),/1—50/);
});
test('daily and intraday projections share a version and config snapshots are immutable and reused',()=>{
  const f=fixture(),lib=f.library.status();const base={enabled:true,automatic_enabled:true};
  const daily=effectiveConfig(base,lib,'daily'),live=effectiveConfig(base,lib,'intraday');
  assert.equal(daily.pool_version,live.pool_version);assert.equal(daily.managed_symbols.length,2);
  const path=snapshotConfig(f.root,live,'intraday');assert.equal(path,snapshotConfig(f.root,live,'intraday'));
  live.codes.push('600519');assert.equal(JSON.parse(readFileSync(path,'utf8')).codes.length,2);
});
test('mid-cycle library edit does not change worker snapshot and takes effect after close',()=>{
  const f=fixture(),fake=new EventEmitter();let args;
  const controller=createIntradayTrial({projectRoot:f.root,platformRoot:f.platform,python:'fixture',now:()=>new Date('2026-11-25T02:00:00Z'),spawnProcess:(...a)=>{args=a;return fake;}});
  controller.start();const frozen=JSON.parse(readFileSync(args[1][2],'utf8'));assert.equal(frozen.pool_version,1);
  const draft=f.library.status().stocks.map(s=>({...s}));Object.assign(draft.find(s=>s.code==='000002'),{quote:false,minute:false});Object.assign(draft.find(s=>s.code==='600036'),{quote:true,minute:true});
  f.library.save(draft,1);
  let status=controller.status({light:true});assert.deepEqual(status.codes,['000001','000002']);assert.equal(status.pool_pending,true);
  assert.equal(status.configured_pool_version,2);assert.equal(status.running_pool_version,1);
  fake.emit('close',1);status=controller.status({light:true});assert.ok(status.codes.includes('600036'));assert.ok(!status.codes.includes('000002'));
});
test('quote-only selection needs no minute row and changed daily pool cannot expose old signals as ready',()=>{
  const now=new Date('2026-11-25T02:00:00Z');
  const report={codes:['000001'],minute_codes:[],rounds:[{checks:[{kind:'quote',source:'sina',ok:true,data:[{code:'000001',source_time:now.toISOString()}]}]}]};
  assert.equal(recoveryQuality(report,now).eligible,true);
  const f=fixture();const draft=f.library.status().stocks.map(s=>({...s}));draft.find(s=>s.code==='600519').daily=true;f.library.save(draft,1);
  const runtime=join(f.root,'outputs/live-market-data');writeFileSync(join(runtime,'status.json'),JSON.stringify({state:'ready',last_success:{data_date:'2026-11-24',pool_hash:'old'}}));
  const daily=createMarketDataController({projectRoot:f.root,platformRoot:f.platform,python:'fixture',now:()=>new Date('2026-11-25T02:00:00Z')});
  assert.equal(daily.status().state,'stale');assert.equal(daily.signals().available,false);
});
