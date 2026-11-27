const dayFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'});
export const chinaDay=value=>Number.isFinite(Date.parse(value))?dayFormatter.format(new Date(value)):null;
export function changePercent(quote){
  return Number.isFinite(quote?.last)&&quote.last>0&&Number.isFinite(quote?.previous_close)&&quote.previous_close>0
    ?(quote.last/quote.previous_close-1)*100:null;
}
export function selectedQuotes(status,source){
  const allowed=new Set(status.codes||[]),byCode=new Map();
  for(const quote of status.quotes||[]){
    if(quote.source!==source||!allowed.has(quote.code))continue;
    const previous=byCode.get(quote.code);
    if(!previous||(Date.parse(quote.source_time)||0)>(Date.parse(previous.source_time)||0))byCode.set(quote.code,quote);
  }
  return [...byCode.values()];
}
export function poolSnapshot(status,source){
  const quotes=selectedQuotes(status,source),day=quotes.map(q=>chinaDay(q.source_time)).filter(Boolean).sort().at(-1)||null;
  const sameDay=quotes.filter(q=>day&&chinaDay(q.source_time)===day),valid=sameDay.filter(q=>changePercent(q)!==null);
  const changes=valid.map(changePercent).sort((a,b)=>a-b),middle=Math.floor(changes.length/2);
  const median=!changes.length?null:changes.length%2?changes[middle]:(changes[middle-1]+changes[middle])/2;
  const bins=[0,0,0,0,0,0,0];
  for(const value of changes)bins[value<=-5?0:value<-2?1:value<0?2:value===0?3:value<2?4:value<5?5:6]++;
  const amounts=sameDay.filter(q=>Number.isFinite(q.amount_yuan)&&q.amount_yuan>=0&&q.last>0);
  return {quotes,day,sameDay,valid,up:changes.filter(v=>v>0).length,flat:changes.filter(v=>v===0).length,down:changes.filter(v=>v<0).length,
    unknown:(status.codes||[]).length-valid.length,median,bins,
    turnover:amounts.length?amounts.reduce((sum,q)=>sum+q.amount_yuan,0):null,amountCount:amounts.length,
    turnoverLeaders:[...amounts].sort((a,b)=>b.amount_yuan-a.amount_yuan).slice(0,6),
    otherDay:quotes.length-sameDay.length,cached:sameDay.filter(q=>q.cached).length,
    fresh:quotes.filter(q=>!q.cached&&q.fresh&&status.current_context==='trading').length,
    firstTime:sameDay.map(q=>q.source_time).sort((a,b)=>Date.parse(a)-Date.parse(b))[0],
    lastTime:sameDay.map(q=>q.source_time).sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1)};
}
export function sampleAverages(rows){
  if(!rows.length||rows.some(row=>!Number.isFinite(row.volume_shares)||row.volume_shares<0||!Number.isFinite(row.amount_yuan)||row.amount_yuan<0
    ||(row.volume_shares===0)!==(row.amount_yuan===0)))return [];
  let shares=0,money=0;
  return rows.map(row=>{shares+=row.volume_shares;money+=row.amount_yuan;return {...row,average:shares>0?money/shares:null};});
}
export function timingSeries(history=[],target=60){
  const slots=history.slice(-20).map(item=>({...item,interrupted:/上次.*任务中断|上次.*进程中断/.test(item.error||''),
    valid:Number.isFinite(item.elapsed_seconds)&&item.elapsed_seconds>=0}));
  const measured=slots.filter(item=>item.valid&&!item.interrupted),values=measured.map(item=>item.elapsed_seconds).sort((a,b)=>a-b);
  const percentile=p=>values.length?values[Math.max(0,Math.ceil(values.length*p)-1)]:null;
  return {slots,measured,target,p50:percentile(.5),p95:percentile(.95),excluded:slots.length-measured.length};
}
