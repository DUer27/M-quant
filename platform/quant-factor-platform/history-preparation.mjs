import { appendFileSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { effectiveConfig, readLibrary, snapshotConfig } from './stock-library.mjs';
import { expectedDailyDate } from './market-data.mjs';

const read = (path, fallback = {}) => { try { return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, '')); } catch { return fallback; } };
const alive = pid => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch { return false; } };
const stamp = (runtime, code) => {
  try { return Object.fromEntries(['csv', 'json'].map(suffix => {
    const stat = statSync(join(runtime, 'cache', `${code}.${suffix}`), {bigint:true});
    return [suffix, {size:Number(stat.size), mtime_ms:Number(stat.mtimeNs / 1000000n)}];
  })); } catch { return null; }
};
export function historyQuietTime(now, dates) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
  const day = `${parts.year}-${parts.month}-${parts.day}`, clock = `${parts.hour}:${parts.minute}:${parts.second}`;
  return !!dates?.length && [...dates].sort().at(-1) >= day && (!dates.includes(day) || clock < '09:25:00' || clock > '15:05:00');
}
export function createHistoryPreparation({projectRoot, platformRoot, python, spawnProcess=spawn, now=()=>new Date(), busy=()=>false}) {
  const runtime=join(projectRoot,'outputs/live-market-data'),directory=join(runtime,'history-preparation'),path=join(directory,'status.json');
  const configPath=join(platformRoot,'config/market-data.json');
  const gapPath=join(runtime,'daily-gap-review/status.json');
  let child=null,active=null,lastStart=0,lastPoll=0,stopping=false,activeMode='history';
  const config=()=>effectiveConfig(read(configPath),readLibrary(projectRoot),'daily');
  const autoKey=cfg=>`${cfg.pool_id}:${cfg.pool_version}:${now().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'})}`;
  const writeAt=(target,value)=>{mkdirSync(join(target,'..'),{recursive:true});const temp=target+'.'+randomUUID()+'.tmp';writeFileSync(temp,JSON.stringify(value,null,2));renameSync(temp,target);};
  const running=saved=>!!child&&activeMode==='history'||saved.state==='running'&&alive(saved.pid);
  function status() {
    const cfg=config(),saved=read(path),isRunning=running(saved),dates=read(join(runtime,'calendar.json')).dates||[];
    const requirements={start_date:cfg.start_date,min_history_days:cfg.min_history_days,adjust:'qfq',rule:'history-start.v2'};
    const expected=expectedDailyDate(dates,now(),cfg.completed_bar_after);
    const previous=new Map((saved.stocks||[]).map(row=>[row.code,row]));
    const stocks=(cfg.managed_symbols||[]).map(stock=>{
      const receipt=previous.get(stock.code),currentStamp=stamp(runtime,stock.code);
      const valid=receipt?.state==='checked' && currentStamp && JSON.stringify(receipt.requirements)===JSON.stringify(requirements)
        && JSON.stringify(receipt.cache_stamp)===JSON.stringify(currentStamp) && (!expected||receipt.as_of<=expected);
      return {...stock,...(receipt||{}),name:stock.name,state:valid?'checked':receipt?.state==='failed'?'failed':'queued',
        current:!!valid, fresh:!!valid&&!!expected&&receipt.as_of===expected, reason:valid?null:receipt?.reason||'等待历史校验或补采'};
    });
    const coverage={total:stocks.length,checked:stocks.filter(row=>row.current).length,failed:stocks.filter(row=>row.state==='failed').length};
    coverage.queued=coverage.total-coverage.checked-coverage.failed;
    let state=isRunning?'running':saved.state==='running'?'interrupted':saved.state||'not_started';
    if(!isRunning&&coverage.checked===coverage.total&&coverage.total)state='checked';
    else if(!isRunning&&state==='checked')state='pending';
    const scheduler=read(join(directory,'scheduler.json'));
    const gapSaved=read(gapPath),gapRunning=!!child&&activeMode==='gaps'||gapSaved.state==='running'&&alive(gapSaved.pid);
    const selected=new Set((cfg.managed_symbols||[]).map(s=>s.code));
    const gapStocks=(gapSaved.stocks||[]).filter(s=>selected.has(s.code)).map(row=>{
      const current=JSON.stringify(row.cache_stamp)===JSON.stringify(stamp(runtime,row.code))&&JSON.stringify(row.requirements)===JSON.stringify(requirements);
      return {...row,current,state:current?row.state:'stale'};
    });
    const gapBudget=read(join(runtime,'daily-gap-review/budget.json'));
    const gapReview={...gapSaved,state:gapRunning?'running':gapSaved.state==='running'?'interrupted':gapSaved.state||'not_started',stocks:gapStocks,
      configured_pool_version:cfg.pool_version,pool_pending:gapSaved.pool_version!==cfg.pool_version,
      budget:gapBudget.day===now().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'})?gapBudget:{attempts:0,limit:12},
      suspect_stocks:stocks.filter(s=>s.current&&s.missing_sessions>0).length};
    return {...saved,state,enabled:cfg.history_preparation_enabled!==false,configured_pool_version:cfg.pool_version,
      running_pool_version:active?.pool_version||saved.pool_version,pool_pending:saved.pool_version!==cfg.pool_version,
      quiet_time:historyQuietTime(now(),dates),expected_date:expected,coverage,stocks,gap_review:gapReview,
      next_retry_at:scheduler.key===autoKey(cfg)?scheduler.next_retry_at||null:null,
      auto_attempts:scheduler.key===autoKey(cfg)?scheduler.attempts||0:0,
      auto_retry_exhausted:scheduler.key===autoKey(cfg)&&scheduler.attempts>=3,
      message:state==='checked'?'历史基础校验已完成；逐股日期与日线发布状态分别显示':state==='interrupted'?'上次历史准备中断，已保留缓存，等待重新准备':saved.message||'等待休市后按批准备历史',
      note:'历史校验不等于当天新鲜、无缺口或分钟闭合；每批最多补3只，不发布策略信号。'};
  }
  function start({expectedVersion,manual=true,reviewGaps=false}={}) {
    const cfg=config();
    if(manual&&expectedVersion!==cfg.pool_version)throw new Error('股票池版本已变化，请刷新并保存后再准备');
    const state=status();
    if(child||running(read(path))||read(gapPath).state==='running'&&alive(read(gapPath).pid))return {accepted:false,reason:'历史准备或缺口核查正在运行',status:state};
    const scheduler=read(join(directory,'scheduler.json'));
    if(now().getTime()-Math.max(lastStart,Date.parse(scheduler.last_started_at)||0,Date.parse(read(gapPath).started_at)||0)<60000)return {accepted:false,reason:'请在上一批启动至少60秒后再试',status:state};
    if(!state.quiet_time||busy())return {accepted:false,reason:'历史准备等待休市且最新行情、分钟补采和日线任务空闲',status:state};
    if(reviewGaps){
      if(state.gap_review.budget.attempts>=12)return {accepted:false,reason:'今日缺口核查来源尝试已达12次，等待明日继续',status:state};
      const previous=new Map(state.gap_review.stocks.map(s=>[s.code,s]));
      if(!state.stocks.some(s=>s.current&&s.missing_sessions>0&&(!previous.get(s.code)?.current||previous.get(s.code)?.state==='queued'||previous.get(s.code)?.retryable&&Date.parse(previous.get(s.code).next_retry_at)<=now().getTime())))
        return {accepted:false,reason:'当前缺口已核查或等待30分钟重试；历史未准备的股票需先准备',status:state};
    }else if(!state.coverage.queued&&!state.coverage.failed)return {accepted:false,reason:'当前所选历史已通过基础校验，无需重复下载',status:state};
    mkdirSync(directory,{recursive:true});active=cfg;lastStart=now().getTime();
    activeMode=reviewGaps?'gaps':'history';const targetPath=reviewGaps?gapPath:path;
    const run={state:'running',pid:null,pool_version:cfg.pool_version,pool_id:cfg.pool_id,started_at:now().toISOString(),stocks:read(targetPath).stocks||[],message:reviewGaps?'缺口核查启动中':'历史准备任务启动中'};
    writeAt(targetPath,run);
    try {
      child=spawnProcess(python,[join(projectRoot,'tools',reviewGaps?'daily_gap_review.py':'stock_history_prepare.py'),'--config',snapshotConfig(projectRoot,cfg,reviewGaps?'gap-review':'history'),'--runtime',runtime],
        {cwd:projectRoot,windowsHide:true,env:{...process.env,PYTHONIOENCODING:'utf-8',PYTHONDONTWRITEBYTECODE:'1'},stdio:['ignore','pipe','pipe']});
    } catch(error) {child=null;active=null;writeAt(targetPath,{...run,state:'failed',message:error.message});return {accepted:false,reason:error.message,status:status()};}
    const owned=child,startedAt=lastStart;
    // Persist ownership before returning; workers overwrite this with their own run.
    writeAt(targetPath,{...run,pid:owned.pid});
    for(const stream of [owned.stdout,owned.stderr])stream?.on('data',data=>appendFileSync(join(directory,'worker.log'),data));
    let error='';owned.once('error',event=>{error=event.message;});
    owned.once('close',code=>{
      child=null;active=null;stopping=false;const saved=read(targetPath);
      if(saved.state==='running')writeAt(targetPath,{...saved,state:code===75?'waiting':'interrupted',finished_at:now().toISOString(),message:error|| (code===75?'等待日线任务释放更新锁':'历史准备中断，保留缓存与已完成检查')});
      if(reviewGaps)return;
      const result=status(),key=autoKey(cfg);
      const previous=read(join(directory,'scheduler.json')),attempts=(previous.key===key?previous.attempts||0:0)+(result.coverage.failed||error||code!==0?1:0);
      const delay=result.coverage.failed||error||code!==0?1800000:60000;
      const scheduler={key,attempts,last_started_at:new Date(startedAt).toISOString(),next_retry_at:new Date(now().getTime()+delay).toISOString()};
      const temp=join(directory,'scheduler.'+randomUUID()+'.tmp');writeFileSync(temp,JSON.stringify(scheduler));renameSync(temp,join(directory,'scheduler.json'));
    });
    return {accepted:true,status:status()};
  }
  function setEnabled(enabled) {
    if(typeof enabled!=='boolean')throw new Error('自动历史准备开关无效');
    const base=read(configPath),temp=configPath+'.'+randomUUID()+'.tmp';
    writeFileSync(temp,JSON.stringify({...base,history_preparation_enabled:enabled},null,2));renameSync(temp,configPath);
    return status();
  }
  function tick() {
    const state=status();
    if(child){
      if(!stopping&&(!state.quiet_time||busy()||now().getTime()-lastStart>240000)){
        stopping=true;
        if(process.platform==='win32'&&child.pid){
          const killer=spawnProcess('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
          killer.once('error',()=>{stopping=false;});
        }else child.kill('SIGKILL');
      }
      return;
    }
    if(!state.enabled||!state.quiet_time||busy()||state.gap_review.state==='running'||state.state==='running'||state.state==='checked')return;
    if(now().getTime()-lastStart<60000)return;
    const cfg=config(),scheduler=read(join(directory,'scheduler.json'));
    const key=autoKey(cfg);
    if(scheduler.key===key&&(scheduler.attempts>=3||Date.parse(scheduler.next_retry_at)>now().getTime()))return;
    start({manual:false});
  }
  function schedule(){const safe=()=>{if(!child&&now().getTime()-lastPoll<15000)return;lastPoll=now().getTime();try{tick();}catch(error){console.error('[history-preparation]',error.message);}};
    const first=setTimeout(safe,15000),timer=setInterval(safe,1000);first.unref();timer.unref();return()=>{clearTimeout(first);clearInterval(timer);};}
  return {status,start,tick,schedule,setEnabled};
}
