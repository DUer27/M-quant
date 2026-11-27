import {readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {readLibrary} from './stock-library.mjs';

const dateFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'});
const timeFormatter=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hourCycle:'h23',hour:'2-digit',minute:'2-digit'});
const dateValid=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
function periodBounds(day,period){
  const d=new Date(day+'T00:00:00Z');
  if(period==='week'){const offset=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-offset);const first=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()+6);return [first,d.toISOString().slice(0,10)];}
  const first=day.slice(0,7)+'-01';return [first,new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).toISOString().slice(0,10)];
}
export function aggregateDailyCandles(rows,period,calendar=[],cutoff='9999-12-31'){
  if(!['week','month'].includes(period))throw new Error('K线周期无效');
  if(!rows.length)return [];
  const sorted=[...rows].sort((a,b)=>a.date.localeCompare(b.date)),groups=new Map(),seen=new Set(),sources=new Set(),adjusts=new Set();
  for(const row of sorted){
    if(!dateValid(row.date)||seen.has(row.date)||!['open','high','low','close','volume'].every(key=>Number.isFinite(row[key]))
      ||Math.min(row.open,row.high,row.low,row.close)<=0||row.high<Math.max(row.open,row.low,row.close)||row.low>Math.min(row.open,row.high,row.close)||row.volume<0
      ||row.amount!=null&&(!Number.isFinite(row.amount)||row.amount<0))throw new Error('日线日期、重复标签或OHLC字段异常，不聚合');
    seen.add(row.date);sources.add(row.source);adjusts.add(row.adjust);
    if(row.date>cutoff)continue;
    const [start,end]=periodBounds(row.date,period),group=groups.get(start)||{start,end,days:[]};group.days.push(row);groups.set(start,group);
  }
  if(sources.size!==1||![...sources].every(value=>typeof value==='string'&&value.length>0)||adjusts.size!==1||![...adjusts].every(value=>['qfq','none'].includes(value)))throw new Error('日线来源或复权口径混合，不拼接聚合');
  const knownCalendar=calendar.filter(dateValid).sort(),calendarEnd=knownCalendar.at(-1),calendarStart=knownCalendar[0];
  return [...groups.values()].slice(-12).map(({start,end,days})=>{
    const expected=knownCalendar.filter(day=>day>=start&&day<=end),present=new Set(days.map(day=>day.date));
    const calendarKnown=!!calendarStart&&calendarStart<=start&&calendarEnd>=end;
    const missing=expected.filter(day=>day<=cutoff&&!present.has(day)),pending=expected.filter(day=>day>cutoff);
    const unexpected=calendarKnown?days.filter(day=>!expected.includes(day.date)).length:0;
    return {time:days.at(-1).date+'T15:00:00+08:00',label:start,period_start:start,period_end:end,
      first_date:days[0].date,last_date:days.at(-1).date,open:days[0].open,high:Math.max(...days.map(day=>day.high)),
      low:Math.min(...days.map(day=>day.low)),close:days.at(-1).close,
      volume_shares:Number((days.reduce((sum,day)=>sum+day.volume,0)*100).toFixed(6)),
      amount_yuan:days.every(day=>Number.isFinite(day.amount))?days.reduce((sum,day)=>sum+day.amount,0):null,
      trading_days:days.length,expected_days:calendarKnown?expected.length:null,calendar_known:calendarKnown,
      missing_count:missing.length,missing_dates:missing.slice(0,8),pending_count:pending.length,
      unexpected_count:unexpected,observed_complete:calendarKnown&&missing.length===0&&pending.length===0&&unexpected===0,
      adjust:days[0].adjust,source:days[0].source,strategy_eligible:false};
  });
}
export function createCandleHistory({projectRoot,parseCsv,now=()=>new Date()}){
  return {get(code,period,expectedVersion){
    if(!/^(?:00|30|60)\d{4}$/.test(code)||!['week','month'].includes(period))return {error:'股票代码或周期无效',status:400};
    const library=readLibrary(projectRoot),stock=library?.stocks?.find(stock=>stock.code===code&&stock.quote);
    if(!stock)return {error:'股票不在当前报价池中',status:400};
    if(expectedVersion!=null&&expectedVersion!==library.version)return {error:'股票池版本已变化，请刷新',status:409};
    const base={schema:'candle-history.v1',code,name:stock.name,period,pool_version:library.version,rows:[],strategy_eligible:false};
    try{
      const file=join(projectRoot,'outputs/live-market-data/cache',code+'.csv');if(statSync(file).size>4_000_000)throw new Error('日线缓存超出读取上限');
      const raw=readFileSync(file,'utf8'),records=parseCsv(raw);if(records.length>10000)throw new Error('日线缓存条数异常');
      if(records.some(row=>String(row.code).padStart(6,'0')!==code))throw new Error('日线缓存股票代码不匹配');
      const daily=records.map(row=>({...row,...Object.fromEntries(['open','high','low','close','volume','amount'].map(key=>[key,row[key]==null||String(row[key]).trim()===''?null:Number(row[key])]))}));
      const current=now(),today=dateFormatter.format(current),previous=new Date(today+'T00:00:00Z');previous.setUTCDate(previous.getUTCDate()-1);
      const cutoff=timeFormatter.format(current)>='16:30'?today:previous.toISOString().slice(0,10);
      let calendar=[];try{const saved=JSON.parse(readFileSync(join(projectRoot,'outputs/live-market-data/calendar.json'),'utf8'));calendar=Array.isArray(saved.dates)?saved.dates:[];}catch{}
      const rows=aggregateDailyCandles(daily,period,calendar,cutoff);
      const presentPeriods=new Set(rows.map(row=>row.period_start));
      const missingPeriods=rows.length?[...new Set(calendar.filter(day=>dateValid(day)&&day>=rows[0].period_start&&day<=rows.at(-1).period_end&&day<=cutoff)
        .map(day=>periodBounds(day,period)[0]))].filter(start=>!presentPeriods.has(start)):[];
      return {...base,rows,version:createHash('sha256').update(raw).digest('hex'),state:rows.length?'available':'missing',
        source:daily[0]?.source,adjust:daily[0]?.adjust,as_of:rows.at(-1)?.last_date||null,daily_cutoff:cutoff,
        missing_period_count:missingPeriods.length,missing_periods:missingPeriods.slice(0,12),
        note:'仅由同来源、同口径的已保存日线聚合，成交量由手换算为股；不使用报价补齐未完成日线。'};
    }catch(error){return {...base,state:error.code==='ENOENT'?'missing':'invalid',warning:error.code==='ENOENT'?'尚无该股票的日线缓存':error.message};}
  }};
}
