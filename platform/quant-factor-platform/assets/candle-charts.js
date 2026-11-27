import {intradayCandles,validCandle} from './candle-data.js';
import {chinaDay} from './intraday-chart-data.js';
import {candleViewport} from './candle-viewport.js';
const NS='http://www.w3.org/2000/svg',clock=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',hour12:false,hour:'2-digit',minute:'2-digit'});
const number=value=>Number.isFinite(value)?value.toLocaleString('zh-CN',{maximumFractionDigits:8}):'缺失';
const compact=value=>value>=1e8?(value/1e8).toFixed(2)+'亿':value>=1e4?(value/1e4).toFixed(1)+'万':String(value);
function node(tag,attrs={},text){const n=document.createElementNS(NS,tag);for(const [key,value]of Object.entries(attrs))n.setAttribute(key,String(value));if(text!=null)n.textContent=String(text);return n;}
function message(root,text){const p=document.createElement('p');p.className='intraday-empty';p.textContent=text;root.append(p);}
export function renderCandleCharts(panel,status,selection,minute){
  const field=name=>panel.querySelector(`[data-chart="${name}"]`),price=field('price'),volume=field('volume'),note=field('minute-note'),inspector=field('candle-inspector');
  const period=selection.candlePeriod||'intraday',intraday=period==='intraday',history=selection.candleHistory;
  price.replaceChildren();volume.replaceChildren();inspector.hidden=false;
  const minuteModel=intradayCandles(minute?.data,'all'),data=history?.data;
  const matching=data?.code===selection.code&&data?.period===period&&(status.configured_pool_version==null||data.pool_version===status.configured_pool_version);
  let rows=intraday?minuteModel.rows:matching?(data.rows||[]).filter(row=>validCandle(row)&&/^\d{4}-\d{2}-\d{2}$/.test(row.period_start||'')&&Number.isFinite(Date.parse(row.period_start))&&Number.isFinite(Date.parse(row.period_end))):[];
  const scope=[selection.code,period,intraday?minuteModel.day:data?.source,intraday?minute?.data?.source:data?.adjust].join(':');
  const view=candleViewport(rows,scope,selection.candleViewport,intraday?selection.candleWindow:'all',period);
  selection.candleViewportModel=view;rows=view.rows;
  field('viewport-controls').hidden=false;
  const control=name=>panel.querySelector(`[data-intraday="${name}"]`);
  for(const [name,allowed]of [['candle-zoom-in',view.canZoomIn],['candle-zoom-out',view.canZoomOut],['candle-earlier',view.canEarlier],['candle-later',view.canLater],['candle-latest',view.canLater],['candle-reset',view.size<view.total]])control(name).disabled=!allowed;
  if(intraday)control('candle-window').value=view.size===view.total?'all':view.following&&[30,60].includes(view.size)?String(view.size):'custom';
  field('viewport-status').textContent=rows.length?`显示第${view.start+1}—${view.end}根 / 共${view.total}根 · ${view.following?'跟随最新':'已定位历史，可回到最新'}`:'暂无有效K线可缩放';
  const label=intraday?'日内1分钟':period==='week'?'周K':'月K',amountMode=selection.activityMetric==='amount',key=amountMode?'amount_yuan':'volume_shares',unit=amountMode?'元':'股';
  field('price-title').textContent=`${label} · 元 · 红涨绿跌，灰色平盘`;
  field('activity-title').textContent=`${intraday?'分钟':period==='week'?'每周':'每月'}成交${amountMode?'额':'量'}（${unit}）`;
  if(intraday){
    note.textContent=`来源日期${minuteModel.day||'暂无'} · ${minute?.data?.source||'分钟来源未返回'} · ${minute?.data?.adjust==='none'?'不复权':minute?.data?.adjust==='qfq'?'前复权':'复权口径未提供'} · 已有${minuteModel.total}根，显示${rows.length}根；逐根保留开高低收，不按报价拼接或压缩。分钟闭合仍待验证，仅供观察。`;
    if(minuteModel.day&&minuteModel.day!==chinaDay(new Date().toISOString()))note.textContent+=' 当前是历史日期样本，不能当作今天新行情。';
    if(minute?.cached)note.textContent+=' 本轮未完成，保留上次成功样本。';
    if(status.automatic_enabled===false)note.textContent+=' 自动采集当前暂停。';
    if(minuteModel.suspected_missing_labels)note.textContent+=` 内部疑似缺失${minuteModel.suspected_missing_labels}个标签，不补零。`;
    if(minuteModel.invalid||minuteModel.duplicates)note.textContent+=` 排除异常${minuteModel.invalid}条、重复${minuteModel.duplicates}条。`;
    if(minute?.data?.pending_count)note.textContent+=` 隔离候选${minute.data.pending_count}条未绘制。`;
    if(minuteModel.conflicting){rows=[];note.textContent+=' 存在同一时间的冲突数值，停止绘图，等待核查。';}
  }else{
    note.textContent=matching?`${data.source||'未知来源'} · ${data.adjust==='qfq'?'前复权':data.adjust==='none'?'不复权':'口径未确认'} · 日线截至${data.as_of||'暂无'} · 已加载${view.total}根${label}，显示${rows.length}根。${data.note||''} 虚线实体表示日线覆盖未齐或日历待核实。`:'正在读取所选股票的精简历史K线；不下载全池分钟历史。';
    if(data?.warning)note.textContent+=' '+data.warning;
    if(history?.error)note.textContent+=(rows.length?' 读取失败，显示已加载历史：':' 读取失败：')+history.error;
    if(history?.loading)note.textContent+=' 正在检查缓存更新。';
    if(data?.missing_period_count)note.textContent+=` 日历范围内另有${data.missing_period_count}个整期未取得日线，保留空档，不造K线。`;
  }
  if(!rows.length){message(price,intraday?'暂无可绘制的有效分钟OHLC，保留空图，不合成K线。':history?.loading?'历史K线读取中…':'暂无可绘制的历史K线，请检查日线缓存。');message(volume,'暂无对应量额数据。');inspector.textContent='有有效K线后可点选查看数值。';return;}
  const day=minuteModel.day,full=intraday&&view.size===view.total;
  const start=intraday?full?Date.parse(day+'T09:30:00+08:00'):Date.parse(rows[0].time)-30_000:0;
  const end=intraday?full?Date.parse(day+'T15:00:00+08:00'):Date.parse(rows.at(-1).time)+30_000:rows.length;
  const periodIndex=row=>period==='week'?(Date.parse(row.period_start)-Date.parse(rows[0].period_start))/(7*86400_000)
    :(Number(row.period_start.slice(0,4))-Number(rows[0].period_start.slice(0,4)))*12+Number(row.period_start.slice(5,7))-Number(rows[0].period_start.slice(5,7));
  const slots=intraday?0:periodIndex(rows.at(-1))+1;
  const x=(row,index)=>intraday?64+(Date.parse(row.time)-start)/Math.max(60_000,end-start)*672:64+(periodIndex(row)+.5)/slots*672;
  const low=Math.min(...rows.map(row=>row.low)),high=Math.max(...rows.map(row=>row.high)),padding=Math.max((high-low)*.08,.01);
  const floor=198,y=value=>floor-(value-(low-padding))/(high-low+2*padding)*172;
  const plot=node('svg',{viewBox:'0 0 760 250',role:'img','aria-label':`${selection.code} ${label}开高低收，来源数据仅供观察`,class:'intraday-svg'});
  const vol=node('svg',{viewBox:'0 0 760 132',role:'img','aria-label':`${selection.code} ${label}成交${amountMode?'额':'量'}，${unit}`,class:'intraday-svg'});
  for(let i=0;i<5;i++){const value=low-padding+(high-low+2*padding)*i/4;plot.append(node('line',{x1:64,x2:736,y1:y(value),y2:y(value),stroke:'#e4ebf2'}),node('text',{x:56,y:y(value)+4,'text-anchor':'end','font-size':11,fill:'#607086'},value.toFixed(2)));}
  if(intraday){
    const lunchStart=64+(Date.parse(day+'T11:30:00+08:00')-start)/(end-start)*672,lunchEnd=64+(Date.parse(day+'T13:00:00+08:00')-start)/(end-start)*672;
    const a=Math.max(64,lunchStart),b=Math.min(736,lunchEnd);
    if(b>a)for(const [target,height]of [[plot,172],[vol,74]])target.append(node('rect',{x:a,y:22,width:b-a,height,fill:'#eef2f6'}));
    if(b-a>50)plot.append(node('text',{x:(a+b)/2,y:37,'text-anchor':'middle','font-size':11,fill:'#708090'},'午间休市'));
  }
  const metricRows=rows.filter(row=>Number.isFinite(row[key])),max=Math.max(1,...metricRows.map(row=>row[key]));
  vol.append(node('text',{x:58,y:18,'text-anchor':'end','font-size':10,fill:'#607086'},`${compact(max)}${unit}`));
  const width=intraday?Math.max(1.2,Math.min(10,672/Math.max(1,(end-start)/60_000)*.64)):Math.min(26,672/slots*.55);
  function inspect(row,remember=true){
    if(remember)selection.candleFocus=row.label;
    inspector.textContent=`${intraday?`${day} ${clock.format(new Date(row.time))}`:row.period_start+'—'+row.period_end} · 开 ${number(row.open)} / 高 ${number(row.high)} / 低 ${number(row.low)} / 收 ${number(row.close)} 元 · 成交量 ${number(row.volume_shares)} 股 · 成交额 ${number(row.amount_yuan)} 元`+
      (intraday?' · 闭合待验证':` · 日线${row.trading_days}天${row.calendar_known?` / 应有${row.expected_days}天`:'，日历未确认'} · 待到期${row.pending_count||0}天 / 疑似缺失${row.missing_count||0}天${row.unexpected_count?' / 日历外标签'+row.unexpected_count+'天':''}`);
  }
  const step=Math.max(1,Math.ceil(rows.length/5));
  rows.forEach((row,index)=>{
    const cx=x(row,index),color=row.close>row.open?'#d44c52':row.close<row.open?'#13906f':'#7b8798';
    const group=node('g',{tabindex:0,role:'button','aria-label':`${intraday?clock.format(new Date(row.time)):row.label}，开${row.open}，高${row.high}，低${row.low}，收${row.close}`,'data-candle-label':row.label});
    group.append(node('line',{x1:cx,x2:cx,y1:y(row.high),y2:y(row.low),stroke:color,'stroke-width':1}),
      node('rect',{x:cx-width/2,y:Math.min(y(row.open),y(row.close)),width,height:Math.max(1,Math.abs(y(row.open)-y(row.close))),fill:color,stroke:color,
        'stroke-dasharray':!intraday&&!row.observed_complete?'3 2':'none'}),
      node('rect',{x:cx-Math.max(4,width/2),y:22,width:Math.max(8,width),height:176,fill:'transparent'}),
      node('title',{},`${row.label} 开${row.open} 高${row.high} 低${row.low} 收${row.close}；量${number(row.volume_shares)}股；额${number(row.amount_yuan)}元`));
    for(const type of ['mouseenter','focus','click'])group.addEventListener(type,()=>inspect(row));plot.append(group);
    if(Number.isFinite(row[key])){const height=row[key]/max*70,bar=node('rect',{x:cx-width/2,y:92-height,width,height,fill:color});bar.append(node('title',{},`${row.label} ${number(row[key])}${unit}`));vol.append(bar);}
    else vol.append(node('text',{x:cx,y:88,'text-anchor':'middle','font-size':10,fill:'#8793a3'},'—'));
    if(index%step===0||index===rows.length-1){const label=intraday?clock.format(new Date(row.time)):period==='week'?row.period_start.slice(5):row.period_start.slice(0,7);
      for(const [target,cy]of [[plot,225],[vol,117]])target.append(node('text',{x:cx,y:cy,'text-anchor':'middle','font-size':10,fill:'#607086'},label));}
  });
  for(const target of [plot,vol]){
    target.addEventListener('wheel',event=>{
      if(!event.ctrlKey||!event.deltaY||!selection.onViewport)return;
      event.preventDefault();const rect=target.getBoundingClientRect(),position=(event.clientX-rect.left)/rect.width*760;
      let anchor=rows[0],distance=Infinity;
      rows.forEach((row,index)=>{const gap=Math.abs(x(row,index)-position);if(gap<distance){distance=gap;anchor=row;}});
      selection.onViewport({type:'zoom',direction:event.deltaY<0?'in':'out',anchor:anchor.label});
    },{passive:false});
  }
  price.append(plot);if(metricRows.length)volume.append(vol);else message(volume,'来源未提供对应成交额，不用成交量或零值替代。');
  inspect(rows.find(row=>row.label===selection.candleFocus)||rows.at(-1),false);
}
