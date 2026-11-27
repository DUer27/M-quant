import {chinaDay} from './intraday-chart-data.js';
const clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hourCycle:'h23',hour:'2-digit',minute:'2-digit',second:'2-digit'});
export function validCandle(row){
  return ['open','high','low','close'].every(key=>Number.isFinite(row[key])&&row[key]>0)
    &&row.high>=Math.max(row.open,row.close,row.low)&&row.low<=Math.min(row.open,row.close,row.high)
    &&Number.isFinite(row.volume_shares)&&row.volume_shares>=0
    &&(row.amount_yuan==null||(Number.isFinite(row.amount_yuan)&&row.amount_yuan>=0));
}
export function intradayCandles(data,window='all'){
  const input=Array.isArray(data?.rows)?data.rows:[],dated=input.filter(row=>chinaDay(row.time));
  const day=dated.map(row=>chinaDay(row.time)).sort().at(-1)||null,rows=[],seen=new Map();
  let invalid=0,duplicates=0,conflicting=false;
  for(const row of dated.filter(row=>chinaDay(row.time)===day).sort((a,b)=>Date.parse(a.time)-Date.parse(b.time))){
    const time=clock.format(new Date(row.time));
    if(!validCandle(row)||!time.endsWith(':00')||!(time>='09:30:00'&&time<='11:30:00'||time>='13:00:00'&&time<='15:00:00')){invalid++;continue;}
    const stamp=Date.parse(row.time),old=seen.get(stamp);
    if(old){duplicates++;if(['open','high','low','close','volume_shares','amount_yuan'].some(key=>old[key]!==row[key]))conflicting=true;continue;}
    seen.set(stamp,row);rows.push({...row,label:row.time});
  }
  let missing=0;
  for(let i=1;i<rows.length;i++)for(let t=Date.parse(rows[i-1].time)+60_000;t<Date.parse(rows[i].time);t+=60_000){
    const label=clock.format(new Date(t));
    if(label>'09:30:00'&&label<'11:30:00'||label>'13:00:00'&&label<'14:57:00')missing++;
  }
  const limit=['30','60'].includes(String(window))?Number(window):rows.length;
  return {day,rows:conflicting?[]:rows.slice(-limit),total:rows.length,invalid:invalid+input.length-dated.length,duplicates,conflicting,suspected_missing_labels:missing};
}
