import {appendFileSync,existsSync,mkdirSync,readFileSync,renameSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readLibrary,effectiveConfig,snapshotConfig} from './stock-library.mjs';

const read=(path,fallback={})=>{try{return JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));}catch{return fallback;}};
const alive=pid=>{if(!pid)return false;try{process.kill(pid,0);return true;}catch{return false;}};
const ages=(time,now)=>Number.isFinite(Date.parse(time))?(now-Date.parse(time))/1000:null;
export function laneQuality(report,kind,codes,now){
  const checks=report.rounds?.at(-1)?.checks||[],times={};
  if(!codes.length)return {eligible:false,times};
  if(kind==='quote'){
    const source=checks.find(c=>c.kind==='quote'&&c.ok&&codes.every(code=>c.data?.some(row=>row.code===code&&ages(row.source_time,now)!==null&&ages(row.source_time,now)>=0&&ages(row.source_time,now)<=90)));
    if(!source)return {eligible:false,times};
    for(const code of codes)times[code]=source.data.find(row=>row.code===code).source_time;
  }else{
    for(const code of codes){const check=checks.find(c=>c.kind==='minute'&&c.code===code&&c.ok&&c.selected!==false);
      if(!check?.data?.rows?.length||ages(check.data.source_time,now)<0||ages(check.data.source_time,now)>180||ages(check.data.source_time,now)===null)return {eligible:false,times:{}};
      times[code]=check.data.source_time;}
  }
  return {eligible:true,times};
}

export function createSplitIntraday({projectRoot,platformRoot,python,legacy,currentContext,nextTradingStart,spawnProcess=spawn,now=()=>new Date()}){
  const runtime=join(projectRoot,'outputs/live-market-data/intraday-trial'),configPath=join(platformRoot,'config/intraday-trial.json');
  const statePath=join(runtime,'split-schedule.json'),saved=read(statePath);
  const definitions={quote:{runtime:join(runtime,'quote-lane'),hard:45,max:120},minute:{runtime,hard:180,max:300}};
  const lanes=Object.fromEntries(Object.entries(definitions).map(([kind,def])=>[kind,{...def,...saved[kind],child:null,pending:saved[kind]?.pending||null}]));
  for(const lane of Object.values(lanes))mkdirSync(lane.runtime,{recursive:true});
  let timer=null,lastTickAt=null;
  const config=()=>effectiveConfig(read(configPath),readLibrary(projectRoot),'intraday');
  const dates=()=>read(join(projectRoot,'outputs/live-market-data/calendar.json')).dates||[];
  const context=()=>currentContext(now(),dates());
  const day=()=>now().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'});
  const base=(kind,cfg=config())=>kind==='quote'?Math.min(60,Math.max(15,Number(cfg.split_collection?.quote_interval_seconds)||15)):
    Math.min(300,Math.max(60,Number(cfg.split_collection?.minute_interval_seconds)||60));
  const report=(kind,light=false)=>read(join(lanes[kind].runtime,light?'status-light.json':'status.json'));
  const owned=lane=>!!lane.child||alive(lane.active?.pid);
  function persist(){const value=Object.fromEntries(Object.entries(lanes).map(([kind,lane])=>[kind,Object.fromEntries(Object.entries(lane).filter(([key])=>!['child','runtime','hard','max'].includes(key)))]));
    const temporary=statePath+'.'+randomUUID()+'.tmp';writeFileSync(temporary,JSON.stringify(value,null,2));renameSync(temporary,statePath);}
  function notice(kind,type,message){const lane=lanes[kind];lane.notices=[...(lane.notices||[]),{id:`${kind}:${now().getTime()}:${type}`,kind:type,at:now().toISOString(),message}].slice(-10);}
  function stop(kind){const lane=lanes[kind];if(lane.active?.stopping)return;lane.active.stopping=true;
    notice(kind,'timeout',`${kind==='quote'?'报价':'分钟'}任务超过${lane.hard}秒，正在结束该任务并冷却；另一类型独立运行。`);
    if(process.platform==='win32'&&lane.active.pid){const killer=spawnProcess('taskkill.exe',['/PID',String(lane.active.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.once('error',()=>{lane.error='结束超时任务失败，等待原任务退出';});}
    else if(lane.child)lane.child.kill('SIGKILL');else if(lane.active.pid)try{process.kill(lane.active.pid,'SIGKILL');}catch{}
    persist();
  }
  function finish(kind,code){const lane=lanes[kind],active=lane.active;if(!active)return;
    const result=report(kind),elapsed=Math.max(0,(now()-Date.parse(active.started_at))/1000);
    const newRun=result.lane===kind&&result.run_id!==active.previous_run&&result.state!=='running';
    const quality=laneQuality(result,kind,active.codes,now()),observation=context()!=='trading';
    if(code!==0||!newRun)lane.error=lane.error||'本轮未产生完整的新记录，保留成功缓存';
    const complete=!!newRun&&!lane.error&&!active.stopping&&quality.eligible;
    const advanced=complete&&Object.entries(quality.times).every(([key,value])=>!lane.source_times?.[key]||Date.parse(value)>Date.parse(lane.source_times[key]));
    const target=base(kind),fast=elapsed<=target;
    if(!observation){
      if(complete&&fast&&advanced){lane.good=(lane.good||0)+1;lane.source_times=quality.times;if(lane.good>=2){if(lane.interval_seconds>target)notice(kind,'recovered',`${kind==='quote'?'报价':'分钟'}连续两轮完整、来源时间推进且在目标内完成，恢复${target}秒目标。`);lane.interval_seconds=target;}}
      else{lane.good=0;if(!complete||!fast)lane.interval_seconds=Math.min(lane.max,Math.max(target*2,lane.interval_seconds||target));}
      if(active.stopping)lane.interval_seconds=lane.max;
    }
    const health=read(join(lane.runtime,'provider-health.json'));
    if(lane.error||(result.coverage?.[kind==='quote'?'quotes':'minutes']||0)<active.codes.length)
      notice(kind,'incomplete',`${kind==='quote'?'报价':'分钟'}本次未完整更新，保留已有缓存；另一类型继续独立采集。`);
    const sources=kind==='quote'?['sina','tencent']:['sina','eastmoney'];
    const blocked=Math.min(...sources.map(s=>(health[s+'.'+kind]?.blocked_until||0)*1000));
    lane.next_start_at=observation?null:new Date(Math.max(Date.parse(active.started_at)+(lane.interval_seconds||target)*1000,now().getTime()+(active.stopping?lane.max*1000:1000),blocked)).toISOString();
    lane.history=[...(lane.history||[]),{at:now().toISOString(),started_at:active.started_at,run_id:newRun?result.run_id:null,trigger:active.source,
      complete,advanced,observation_only:observation,elapsed_seconds:Math.round(elapsed*1000)/1000,coverage:result.coverage?.[kind==='quote'?'quotes':'minutes']||0,
      interval_seconds:lane.interval_seconds||target,pool_version:active.pool_version,error:lane.error||''}].slice(-60);
    if(active.source==='automatic')lane.automatic_runs=(lane.automatic_runs||0)+1;
    lane.active=null;lane.child=null;persist();
  }
  function maintain(kind){const lane=lanes[kind];if(!lane.active)return;
    if(!owned(lane)){lane.error='上次独立任务中断；保留缓存，等待重试';finish(kind,1);return;}
    const elapsed=(now()-Date.parse(lane.active.started_at))/1000;
    if(elapsed>=base(kind)&&!lane.slow){lane.slow=true;lane.interval_seconds=Math.min(lane.max,Math.max(base(kind)*2,lane.interval_seconds||base(kind)));notice(kind,'slow',`${kind==='quote'?'报价':'分钟'}超过${base(kind)}秒目标，当前间隔临时延长至${lane.interval_seconds}秒；另一类型不受此退避影响。`);persist();}
    if(elapsed>=lane.hard)stop(kind);
  }
  function startOne(kind,source){const lane=lanes[kind],cfg=config(),codes=kind==='quote'?cfg.codes:cfg.minute_codes||cfg.codes;
    maintain(kind);
    if(!codes.length)return {accepted:false,reason:'当前未启用分钟采集'};
    if(owned(lane))return {accepted:false,reason:`${kind==='quote'?'报价':'分钟'}任务仍在运行`};
    if(source==='automatic'&&(!cfg.automatic_enabled||context()!=='trading'))return {accepted:false,reason:'非交易时段或自动采集暂停'};
    if(lane.last_started_at&&now()-Date.parse(lane.last_started_at)<base(kind)*1000)return {accepted:false,reason:'等待该类型的最小采集间隔'};
    if(lane.next_start_at&&Date.parse(lane.next_start_at)>now().getTime())return {accepted:false,reason:'该类型正在退避或冷却，稍后重试'};
    if(legacy.backgroundBusy()){lane.pending=source;persist();legacy.preemptBackfill();return {accepted:true,queued:true,reason:'等待原任务释放；其他类型独立运行'};}
    const result=report(kind),started=now().toISOString();
    lane.error='';lane.slow=false;lane.last_started_at=started;lane.interval_seconds=lane.interval_seconds||base(kind);
    lane.active={started_at:started,source,previous_run:result.run_id,pool_version:cfg.pool_version,codes,pid:null};
    const args=[join(projectRoot,'tools/intraday_probe.py'),'--config',snapshotConfig(projectRoot,cfg,kind+'-lane'),'--runtime',lane.runtime,'--lane',kind];
    if(source==='automatic')args.push('--automatic');
    try{lane.child=spawnProcess(python,args,{cwd:projectRoot,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,PYTHONIOENCODING:'utf-8',PYTHONDONTWRITEBYTECODE:'1'}});
      lane.active.pid=lane.child.pid;persist();
    }catch(error){lane.error='独立任务启动失败';finish(kind,1);return {accepted:false,reason:lane.error};}
    const child=lane.child;
    for(const stream of [child.stdout,child.stderr])stream?.on('data',data=>appendFileSync(join(lane.runtime,'worker.log'),data));
    child.once('error',()=>{lane.error='独立采集进程无法启动';});
    child.once('close',code=>{lane.child=null;finish(kind,code);});
    return {accepted:true};
  }
  function start(source='manual',kind='both'){
    if(!['quote','minute','both'].includes(kind))return {accepted:false,reason:'采集类型无效'};
    const result=Object.fromEntries((kind==='both'?['quote','minute']:[kind]).map(name=>[name,startOne(name,source)]));
    return {accepted:Object.values(result).some(r=>r.accepted),lanes:result,reason:Object.values(result).filter(r=>!r.accepted).map(r=>r.reason).join('；')};
  }
  function status({light=false}={}){
    const cfg=config(),market=context(),original=legacy.status({light}),quoteReport=report('quote',light),minuteReport=report('minute',light);
    const codes=cfg.codes||[],minuteCodes=cfg.minute_codes||codes;
    const currentReport=(kind,value)=>value.lane===kind&&value.pool_version===cfg.pool_version&&(!lanes[kind].active||value.run_id!==lanes[kind].active.previous_run);
    const quoteChecks=currentReport('quote',quoteReport)?quoteReport.rounds?.at(-1)?.checks||[]:[];
    const minuteChecks=currentReport('minute',minuteReport)?minuteReport.rounds?.at(-1)?.checks||[]:[];
    const quotes=[];
    for(const source of ['sina','tencent'])for(const code of codes){
      const current=quoteChecks.find(c=>c.source===source&&c.kind==='quote'&&c.ok&&c.stage!=='recovery');
      const row=current?.data?.find(q=>q.code===code);
      const newPath=join(lanes.quote.runtime,'quote-cache',`${source}-${code}.json`);
      const cached=read(existsSync(newPath)?newPath:join(runtime,'quote-cache',`${source}-${code}.json`));
      const use=!!row&&(!cached.data||Date.parse(row.source_time)>=Date.parse(cached.data.source_time));
      const data=use?row:cached.data;if(!data)continue;
      const age=ages(data.source_time,now());
      quotes.push({...data,age_seconds:age===null?null:Math.round(age),cached:!use,fresh:use&&market==='trading'&&age!==null&&age>=0&&age<=90,
        received_at:use?current.receipt_by_code?.[code]||current.received_at:cached.received_at,run_id:use?quoteReport.run_id:cached.run_id});
    }
    const minutes=minuteCodes.map(code=>{
      const candidates=minuteChecks.filter(c=>c.kind==='minute'&&c.code===code&&(c.selected!==false||!c.ok));
      const current=candidates.find(c=>c.ok),cached=read(join(runtime,'minute-cache',code+(light?'.meta.json':'.json')));
      const use=!!current?.data&&(!cached.data||Date.parse(current.data.source_time)>=Date.parse(cached.data.source_time));
      const data=use?current.data:cached.data,age=ages(data?.source_time,now());
      return {code,data: data||null,received_at:use?current.received_at:cached.received_at,current_ok:use,cached:!!data&&!use,
        fresh:use&&market==='trading'&&age!==null&&age>=0&&age<=180,run_id:use?minuteReport.run_id:cached.run_id,
        error:!use?candidates.at(-1)?.reason||candidates.at(-1)?.error||'本类型等待新数据':'',
        source_failures:candidates.filter(c=>!c.ok).map(c=>({source:c.source,error:c.error}))};
    });
    const laneStatus={};
    for(const kind of ['quote','minute']){const lane=lanes[kind],value=kind==='quote'?quoteReport:minuteReport,rows=kind==='quote'?quotes:minutes.filter(m=>m.data).map(m=>({...m.data,...m}));
      const ownRecord=value.lane===kind&&(!lane.active||value.run_id!==lane.active.previous_run);
      const timestamps=rows.map(r=>(kind==='minute'?r.data?.source_time:r.source_time)).filter(Boolean).sort();
      const receipts=rows.map(r=>r.received_at).filter(Boolean).sort();
      const count=kind==='quote'?new Set(quotes.filter(r=>!r.cached).map(r=>r.code)).size:minutes.filter(m=>m.current_ok).length;
      laneStatus[kind]={state:owned(lane)?'running':lane.error?'failed':value.lane===kind?value.state:'not_started',error:lane.error||'',slow:!!lane.slow,
        trigger:lane.active?.source||(ownRecord?value.trigger:null),run_id:ownRecord?value.run_id:null,previous_run_id:lane.active?.previous_run||null,started_at:lane.active?.started_at||(ownRecord?value.started_at:null),
        finished_at:ownRecord?value.finished_at:null,elapsed_seconds:lane.active?Math.max(0,(now()-Date.parse(lane.active.started_at))/1000):ownRecord?value.elapsed_seconds:null,
        target_seconds:base(kind),interval_seconds:lane.interval_seconds||base(kind),next_start_at:cfg.automatic_enabled&&market==='trading'&&!owned(lane)?lane.next_start_at:null,
        coverage:count,total:kind==='quote'?codes.length:minuteCodes.length,fresh:kind==='quote'?new Set(quotes.filter(r=>r.fresh).map(r=>r.code)).size:minutes.filter(m=>m.fresh).length,
        oldest_source_time:timestamps[0]||null,latest_source_time:timestamps.at(-1)||null,last_received_at:receipts.at(-1)||null,
        max_source_age_seconds:timestamps.length?Math.round(ages(timestamps[0],now())):null,
        configured_pool_version:cfg.pool_version,running_pool_version:lane.active?.pool_version||value.pool_version,
        pool_pending:(lane.active?.pool_version||value.pool_version)!==cfg.pool_version,automatic_runs:lane.day===day()?lane.automatic_runs||0:0,
        history:lane.history||[],pending:!!lane.pending,storage:value.storage||null,metrics:ownRecord?value.metrics||null:null};
    }
    const running=Object.values(lanes).some(owned),allFresh=laneStatus.quote.fresh===codes.length&&laneStatus.minute.fresh===minuteCodes.length;
    const next=Object.values(laneStatus).map(l=>l.next_start_at).filter(Boolean).sort()[0]||null;
    const diagnosticReports=[quoteReport.symbol_diagnostics,minuteReport.symbol_diagnostics].filter(Boolean);
    return {...original,split_collection:true,collection_profile:'split-collection.v1',codes,minute_codes:minuteCodes,quotes,minutes,lanes:laneStatus,
      state:running?'running':Object.values(laneStatus).some(l=>l.error)?'failed':quoteReport.lane==='quote'||minuteReport.lane==='minute'?'sample_available':'not_started',
      fresh:allFresh&&market==='trading',fresh_stocks:laneStatus.quote.fresh,current_quote_stocks:laneStatus.quote.coverage,
      error:Object.values(laneStatus).map(l=>l.error).filter(Boolean).join('；'),elapsed_seconds:Math.max(0,...Object.values(laneStatus).map(l=>l.elapsed_seconds||0)),
      warning:Object.entries(lanes).filter(([,l])=>owned(l)&&l.slow).map(([kind])=>(kind==='quote'?'报价':'分钟')+'已超出更新目标，正在单独退避').join('；'),
      coverage:{quotes:laneStatus.quote.coverage,minutes:laneStatus.minute.coverage,total:codes.length},
      configured_pool_version:cfg.pool_version,running_pool_version:laneStatus.minute.running_pool_version,pool_pending:Object.values(laneStatus).some(l=>l.pool_pending),
      rounds:[{checks:[...quoteChecks.map(c=>({...c,lane:'quote',run_id:quoteReport.run_id})),...minuteChecks.map(c=>({...c,lane:'minute',run_id:minuteReport.run_id}))]}],
      latest_checks:[...quoteChecks,...minuteChecks].map(({data,...check})=>check),
      symbol_diagnostics:{state:diagnosticReports.some(d=>d.state==='degraded')?'degraded':'ready',entries:diagnosticReports.flatMap(d=>d.entries||[]),
        recovery_events:diagnosticReports.flatMap(d=>d.recovery_events||[]),errors:diagnosticReports.flatMap(d=>d.errors||[]),
        extra_requests:diagnosticReports.reduce((n,d)=>n+(d.extra_requests||0),0),policy:{max_requests:diagnosticReports.reduce((n,d)=>n+(d.policy?.max_requests||0),0)}},
      minute_audit:{...original.minute_audit,samples:(original.minute_audit?.samples||[]).map(sample=>({...sample,current_run:currentReport('minute',minuteReport)&&sample.current_run}))},
      source_health:{...Object.fromEntries(Object.entries(read(join(runtime,'provider-health.json'))).filter(([key])=>key.endsWith('.minute'))),...read(join(lanes.quote.runtime,'provider-health.json'))},
      scheduler:{...original.scheduler,active:running?{source:Object.values(lanes).filter(l=>owned(l)).every(l=>l.active?.source==='automatic')?'automatic':'manual'}:null,
        last_tick_at:lastTickAt,interval_seconds:laneStatus.quote.interval_seconds,next_start_at:next,
        next_session_at:cfg.automatic_enabled&&market!=='trading'?nextTradingStart(now(),dates()):null,waiting_for_session:market!=='trading',history:lanes.minute.history||[],
        notices:[...(original.scheduler?.notices||[]),...Object.values(lanes).flatMap(l=>l.notices||[])].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)).slice(-20)},
      validation_note:'报价与分钟已分流，分别记录运行结果；尚未开始新的统一连续验收。',displayed_at:now().toISOString()};
  }
  function tick(){lastTickAt=now().toISOString();const cfg=config();
    for(const kind of ['quote','minute']){maintain(kind);const lane=lanes[kind];
      if(lane.pending&&!legacy.backgroundBusy()){const source=lane.pending;lane.pending=null;startOne(kind,source);}
      if(owned(lane))continue;
      if(context()!=='trading'||!cfg.automatic_enabled)continue;
      const key=day()+':'+cfg.pool_version+':'+(kind==='quote'?cfg.codes:cfg.minute_codes||cfg.codes).join(',');
      if(lane.session!==key){lane.session=key;lane.day=day();lane.automatic_runs=0;lane.good=0;lane.source_times={};lane.interval_seconds=base(kind);lane.next_start_at=null;}
      if(!lane.next_start_at||Date.parse(lane.next_start_at)<=now().getTime())startOne(kind,'automatic');
    }
    if(context()!=='trading'&&!Object.values(lanes).some(owned))legacy.tick();
  }
  function minute(code){if(!(config().minute_codes||config().codes).includes(code))return null;
    const entry=status({light:true}).minutes.find(m=>m.code===code),saved=read(join(runtime,'minute-cache',code+'.json'));
    return {...entry,data:saved.data||null,cached:entry?.cached||entry?.data?.version!==saved.data?.version,fresh:entry?.fresh&&entry.data?.version===saved.data?.version};
  }
  function schedule(){if(timer)return()=>clearInterval(timer);timer=setInterval(()=>{try{tick();}catch(error){console.error('[split-intraday]',error.message);}},1000);timer.unref();return()=>{clearInterval(timer);timer=null;};}
  function health(){const cfg=config();return {mode:'split',automatic_enabled:!!cfg.automatic_enabled,scheduled:!!timer,
    scheduler_last_tick_at:lastTickAt,current_context:context(),lanes:Object.fromEntries(Object.entries(lanes).map(([kind,lane])=>[kind,{
      running:owned(lane),started_at:lane.active?.started_at||null,last_completed_at:lane.history?.at(-1)?.at||null,
      target_seconds:base(kind),interval_seconds:lane.interval_seconds||base(kind),next_start_at:lane.next_start_at||null,
      oldest_advanced_source_time:Object.values(lane.source_times||{}).sort()[0]||null,
      enabled:kind==='quote'?!!cfg.codes?.length:!!(cfg.minute_codes||cfg.codes)?.length}]))};}
  return {status,start,tick,schedule,health,minute,validation:legacy.validation,validationSession:legacy.validationSession,
    beginValidation:()=>({accepted:false,reason:'分流试运行阶段暂缓统一连续验收'}),setAutomatic:legacy.setAutomatic,
    startBackfill:()=>Object.values(lanes).some(owned)?{accepted:false,reason:'最新报价或分钟任务优先'}:legacy.startBackfill(),setBackfillEnabled:legacy.setBackfillEnabled,
    backgroundBusy:()=>Object.values(lanes).some(owned)||legacy.backgroundBusy()};
}
