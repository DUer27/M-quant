import {readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';

export const MINUTE_POLICY_VERSION='minute-use.v2';
export const sourceRules=Object.freeze({
  'sina.minute':Object.freeze({label_semantics:'unverified',closure_rule:'unverified',adjust:'none'}),
  'eastmoney.minute':Object.freeze({label_semantics:'unverified',closure_rule:'unverified',adjust:'none'}),
});
const timestamp=value=>typeof value==='string'&&/(?:Z|[+-]\d\d:\d\d)$/.test(value)&&Number.isFinite(Date.parse(value))?Date.parse(value):null;
const dayFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'});
const clockFormatter=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
const beijing=value=>dayFormatter.format(new Date(value));
const clock=value=>clockFormatter.format(new Date(value));
const session=value=>{const time=clock(value);return time>='09:30:00'&&time<='11:30:00'?'morning':time>='13:00:00'&&time<='15:00:00'?'afternoon':null;};
const boundary=value=>['09:30:00','11:30:00','13:00:00','14:57:00','15:00:00'].includes(clock(value));
const rawRead=path=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));

export function classifyMinuteSeries(data,receivedAt,{audit=null,runId=null}={}){
  const bars=[],gaps=[],problems=[],receipt=timestamp(receivedAt),rule=sourceRules[data?.source];
  if(!data||!Array.isArray(data.rows)||!data.rows.length)return {bars,gaps,problems:['missing_series'],counts:{},source_rule:rule||null};
  if(!rule)problems.push('unsupported_source');
  if(data.adjust!=='none')problems.push('unsupported_basis');
  if(receipt===null)problems.push('invalid_receipt_time');
  if(data.rows.length>1000){problems.push('excessive_series');return {bars,gaps,problems,counts:{},source_rule:rule||null};}
  const evidenceMatches=!!audit&&audit.version===data.version&&audit.run_id===runId&&audit.received_at===receivedAt&&audit.source===data.source&&audit.adjust===data.adjust;
  const evidence=new Map(evidenceMatches?(audit.bar_evidence||[]).map(row=>[row.label,row]):[]);
  const seen=new Set();
  for(const row of data.rows){
    const time=timestamp(row.time);
    if(time===null||seen.has(time)||time%60000!==0){problems.push(time!==null&&seen.has(time)?'duplicate_labels':'invalid_label');continue;}
    seen.add(time);
    const values=['open','high','low','close'].map(key=>row[key]);
    if(values.some(v=>!Number.isFinite(v)||v<=0)||row.high<Math.max(row.open,row.close,row.low)||row.low>Math.min(row.open,row.close,row.high)
      ||!Number.isFinite(row.volume_shares)||row.volume_shares<0||!session(time)){
      problems.push('invalid_bar');continue;
    }
    const state=receipt!==null&&time>receipt?'isolated_future':receipt!==null&&Math.floor(time/60000)===Math.floor(receipt/60000)?'possible_forming':boundary(time)?'boundary_unverified':'closure_unverified';
    const proof=evidence.get(row.time);
    bars.push({label:row.time,state,closure_verified:false,strategy_eligible:false,
      evidence:proof?{observations:proof.observations,unchanged_observations:proof.unchanged_observations,revisions:proof.revisions,
        changed_this_observation:proof.changed_this_observation,later_label_seen:proof.later_label_seen,
        first_received_at:proof.first_received_at,last_received_at:proof.last_received_at,last_changed_at:proof.last_changed_at}:null});
  }
  bars.sort((a,b)=>Date.parse(a.label)-Date.parse(b.label));
  if(bars.length&&timestamp(data.source_time)!==Date.parse(bars.at(-1).label))problems.push('source_label_mismatch');
  if(new Set(bars.map(row=>beijing(row.label))).size>1)problems.push('mixed_days');
  const observed=bars.filter(bar=>bar.state!=='isolated_future');
  for(let i=1;i<observed.length;i++){
    const before=Date.parse(observed[i-1].label),after=Date.parse(observed[i].label);
    if(beijing(before)!==beijing(after)||session(before)!==session(after)||after-before<=60000)continue;
    const labels=[];for(let t=before+60000;t<after&&labels.length<300;t+=60000)labels.push(new Date(t).toISOString());
    const nearBoundary=boundary(before)||boundary(after);
    gaps.push({after:observed[i-1].label,before:observed[i].label,candidate_labels:(after-before)/60000-1,labels,
      state:nearBoundary?'boundary_gap_unverified':'suspected_missing',
      interpretation:nearBoundary?'紧邻时段边界，先核实来源标签和边界口径，不直接判为漏数。':'只核对同一时段已见标签之间，不推断停牌、未知边界或整段缺失。'});
  }
  const pending=Array.isArray(data.pending_rows)?data.pending_rows:[];
  const counts={possible_forming:0,boundary_unverified:0,closure_unverified:0,isolated_future:pending.length,verified_closed:0};
  for(const bar of bars)counts[bar.state]++;
  return {bars,gaps,problems:[...new Set(problems)],counts,source_rule:rule||null,evidence_matches:evidenceMatches,
    evidence_available:bars.filter(b=>b.evidence).length,
    pending_labels:pending.map(row=>row.time),source:data.source,adjust:data.adjust,version:data.version,
    oldest_label:bars[0]?.label||null,latest_label:bars.at(-1)?.label||null,
    suspected_missing_labels:gaps.filter(g=>g.state==='suspected_missing').reduce((n,g)=>n+g.candidate_labels,0),
    boundary_gap_labels:gaps.filter(g=>g.state==='boundary_gap_unverified').reduce((n,g)=>n+g.candidate_labels,0)};
}

export function createMinuteReadiness({projectRoot,now=()=>new Date()}){
  const runtime=join(projectRoot,'outputs/live-market-data/intraday-trial'),memo=new Map();
  function compiled(code){
    const cache=join(runtime,'minute-cache',code+'.json'),auditPath=join(runtime,'minute-audit',code+'.json');
    try{
      const stat=statSync(cache,{bigint:true});let auditStat=null;
      try{const a=statSync(auditPath,{bigint:true});auditStat=`${a.mtimeNs}:${a.size}`;}catch{}
      const key=`${stat.mtimeNs}:${stat.size}:${auditStat}`;
      if(memo.get(code)?.key===key)return memo.get(code).value;
      const saved=rawRead(cache);let audit=null;try{audit=rawRead(auditPath);}catch{}
      if(saved.data?.code!==code)throw new Error('code_mismatch');
      const value={...classifyMinuteSeries(saved.data,saved.received_at,{audit,runId:saved.run_id}),run_id:saved.run_id,
        received_at:saved.received_at,source_time:saved.data?.source_time,version:saved.data?.version};
      memo.set(code,{key,value});return value;
    }catch(error){memo.delete(code);return {bars:[],gaps:[],counts:{},problems:[error.code==='ENOENT'?'missing_series':'cache_unreadable'],run_id:null};}
  }
  function assess(code,status,details=false){
    const data=compiled(code),entry=status.minutes?.find(m=>m.code===code),currentTime=now(),time=timestamp(data.source_time),receipt=timestamp(data.received_at);
    const age=time===null?null:(currentTime-time)/1000;
    const matches=!!entry?.data&&entry.data.version===data.version&&entry.run_id===data.run_id;
    const current=matches&&!!entry.current_ok&&!entry.cached;
    const temporal=time===null?'missing':receipt===null||receipt>currentTime.getTime()||age<0?'invalid_time':beijing(time)!==beijing(currentTime)?'historical':!current?'cached':status.current_context!=='trading'?'off_session':age>180?'stale':'current';
    const blocks=[...data.problems,'label_semantics_unverified','closure_rule_unverified','no_verified_closed_bars'];
    if(!current)blocks.push('not_current_collection');
    if(temporal!=='current')blocks.push(temporal==='off_session'?'outside_trading_session':temporal==='missing'?'missing_series':temporal==='invalid_time'?'invalid_time':temporal==='historical'?'historical_data':'not_fresh');
    if(data.suspected_missing_labels>0)blocks.push('internal_gaps_unresolved');
    if(data.boundary_gap_labels>0)blocks.push('boundary_gaps_unverified');
    if(!matches)blocks.push('cache_version_mismatch');
    const result={code,source:data.source||null,adjust:data.adjust||null,version:data.version||null,run_id:data.run_id,
      received_at:data.received_at||null,source_time:data.source_time||null,source_age_seconds:age===null?null:Math.round(age),
      current_collection:current,time_state:temporal,observation_rows:data.bars.length,counts:data.counts,
      suspected_missing_labels:data.suspected_missing_labels||0,boundary_gap_labels:data.boundary_gap_labels||0,gap_ranges:data.gaps.length,
      evidence_available:data.evidence_available||0,evidence_matches:!!data.evidence_matches,
      last_observed_state:data.bars.at(-1)?.state||'missing',strategy_eligible:false,available:false,verified_closed_bars:0,
      blocking_codes:[...new Set(blocks)],source_rule:data.source_rule||null,policy_version:MINUTE_POLICY_VERSION};
    if(details)Object.assign(result,{labels:data.bars.slice(-30).reverse(),labels_total:data.bars.length,labels_truncated:data.bars.length>30,
      gaps:data.gaps.slice(-10),gaps_truncated:data.gaps.length>10,pending_labels:data.pending_labels||[],
      note:'形成中按原接收时刻判断；重复不变、后续标签出现或时间经过均不自动证明闭合。'});
    return result;
  }
  function summary(status){
    const codes=status.minute_codes||status.codes||[],selected=new Set(codes);
    for(const code of memo.keys())if(!selected.has(code))memo.delete(code);
    const stocks=codes.map(code=>assess(code,status));
    return {schema:'minute-readiness.v1',policy_version:MINUTE_POLICY_VERSION,assessed_at:now().toISOString(),pool_version:status.configured_pool_version,
      total:stocks.length,observation_stocks:stocks.filter(s=>s.observation_rows>0).length,
      strategy_eligible_stocks:0,verified_closed_bars:0,suspected_gap_stocks:stocks.filter(s=>s.suspected_missing_labels>0).length,
      boundary_gap_stocks:stocks.filter(s=>s.boundary_gap_labels>0).length,
      source_rules:sourceRules,stocks,sample_codes:(status.minute_audit?.codes||[]).filter(code=>selected.has(code)).slice(0,3),
      note:'本批所有分钟来源的标签及闭合规则未获确认；策略准入关闭，观察图表仍可使用。'};
  }
  function detail(code,status){if(!/^\d{6}$/.test(code)||!(status.minute_codes||status.codes||[]).includes(code))return null;return assess(code,status,true);}
  function strategy(code,status){const result=detail(code,status);return result?{schema:'strategy-minute-input.v1',code,available:false,strategy_eligible:false,
    policy_version:MINUTE_POLICY_VERSION,blocking_codes:result.blocking_codes,source:result.source,version:result.version,
    received_at:result.received_at,bars:[],message:'分钟标签和闭合规则仍待验证，不向策略返回观察样本。'}:null;}
  return {summary,detail,strategy};
}
