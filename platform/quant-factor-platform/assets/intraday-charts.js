import {changePercent,chinaDay,selectedQuotes,poolSnapshot,sampleAverages,timingSeries} from './intraday-chart-data.js';
import {renderCandleCharts} from './candle-charts.js';
export {changePercent} from './intraday-chart-data.js';
const NS = 'http://www.w3.org/2000/svg';
export const sourceLabel = (source = '') => ({ sina: '新浪', tencent: '腾讯', eastmoney: '东方财富' })[source.split('.')[0]] || source;
const minuteFormatter=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',hour12:false,hour:'2-digit',minute:'2-digit'});
const secondFormatter=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'});
export const shortTime = (time) => Number.isFinite(Date.parse(time))?minuteFormatter.format(new Date(time)):'—';
const quoteTime=time=>Number.isFinite(Date.parse(time))?secondFormatter.format(new Date(time)):'—';
export const amount = (value) => Number.isFinite(value) ? value >= 1e8 ? `${(value / 1e8).toFixed(2)}亿` : value >= 1e4 ? `${(value / 1e4).toFixed(1)}万` : value.toFixed(0) : '缺失';
export function lineSegments(rows) {
  const result = [];
  for (const row of rows) {
    const segment = result.at(-1);
    if (!segment || Date.parse(row.time) - Date.parse(segment.at(-1).time) > 90_000) result.push([row]);
    else segment.push(row);
  }
  return result;
}
export function dayRows(data) {
  if (!data?.rows?.length) return [];
  const valid=data.rows.filter(row=>chinaDay(row.time)&&Number.isFinite(row.close)&&row.close>0).sort((a,b)=>Date.parse(a.time)-Date.parse(b.time));
  const date = chinaDay(valid.at(-1)?.time);
  return valid.filter((row) => chinaDay(row.time) === date);
}
function el(tag, text, cls) {
  const element = document.createElement(tag);
  if (text != null) element.textContent = String(text);
  if (cls) element.className = cls;
  return element;
}
function svgElement(tag, attrs = {}, text) {
  const element = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
  if (text != null) element.textContent = String(text);
  return element;
}
function chart(label, height) {
  return svgElement('svg', { viewBox: `0 0 760 ${height}`, role: 'img', 'aria-label': label, class: 'intraday-svg' });
}
function title(node, text) { node.append(svgElement('title', {}, text)); }
function empty(parent, message) { parent.append(el('p', message, 'intraday-empty')); }
const fixed=value=>Number.isFinite(value)?value.toFixed(2):'缺失';
const pctText=value=>Number.isFinite(value)?`${value>0?'+':''}${value.toFixed(2)}%`:'缺失';
function metric(parent,label,value,note=''){
  const box=el('div',null,'intraday-metric');box.append(el('span',label),el('strong',value),el('small',note));parent.append(box);
}
function poolCharts(field,status,selection,snapshot){
  const overview=field('overview');overview.replaceChildren();
  metric(overview,'同日报价',`${snapshot.sameDay.length}/${status.codes?.length||0}`,snapshot.day||'暂无有效来源日期');
  metric(overview,'上涨 / 下跌',`${snapshot.up} / ${snapshot.down}`,`平盘${snapshot.flat}只 · 涨跌未知${snapshot.unknown}只`);
  metric(overview,'涨跌幅中位数',pctText(snapshot.median),'等权样本中位数，非指数收益');
  metric(overview,'样本累计成交额',snapshot.turnover==null?'缺失':amount(snapshot.turnover)+'元',`${snapshot.amountCount}只有效金额，不跨来源相加`);
  const context={trading:'交易时段',market_closed:'休市',non_trading_day:'非交易日',calendar_unknown:'日历待确认'}[status.current_context]||'状态未知';
  field('scope-note').textContent=`${context} · ${sourceLabel(selection.source)} · 来源日期${snapshot.day||'未知'} · 时间范围${quoteTime(snapshot.firstTime)}—${quoteTime(snapshot.lastTime)}。${snapshot.cached}只使用上次成功缓存，${snapshot.otherDay}只其他日期报价已排除概览。以下是股票池样本，不代表全市场；休市或旧样本不视为实时。`;
  const breadth=field('breadth');breadth.replaceChildren();
  const strip=el('div',null,'intraday-breadth-strip');strip.setAttribute('role','img');
  strip.setAttribute('aria-label',`上涨${snapshot.up}只，平盘${snapshot.flat}只，下跌${snapshot.down}只，未知${snapshot.unknown}只`);
  for(const [count,label,cls]of [[snapshot.up,'上涨','rise'],[snapshot.flat,'平盘','flat'],[snapshot.down,'下跌','fall'],[snapshot.unknown,'未知','unknown']]){
    if(!count)continue;const segment=el('span',`${label}${count}`,cls);segment.style.flex=String(count);segment.title=`${label} ${count}只`;strip.append(segment);
  }breadth.append(strip);
  const distribution=el('div',null,'intraday-distribution');
  for(const [index,label]of ['≤-5%','-5%~-2%','-2%~0%','0%','0%~2%','2%~5%','≥5%'].entries()){
    const item=el('div'),track=el('span',null,'intraday-distribution-track'),bar=el('span',null,index<3?'fall':index>3?'rise':'flat');
    bar.style.height=`${snapshot.bins[index]/Math.max(1,...snapshot.bins)*100}%`;track.append(bar);
    item.append(el('strong',snapshot.bins[index]),track,el('small',label));distribution.append(item);
  }breadth.append(distribution,el('small','区间相接时取右侧区间（-5%计最左档）；未知不作平盘。'));
  const turnover=field('turnover');turnover.replaceChildren();
  if(!snapshot.turnoverLeaders.length)empty(turnover,'当前来源没有有效的同日成交额。');
  const max=Math.max(1,...snapshot.turnoverLeaders.map(q=>q.amount_yuan));
  for(const quote of snapshot.turnoverLeaders){
    const button=el('button',null,'intraday-turnover-row');button.type='button';button.setAttribute('aria-label',`${quote.name||quote.code} 成交额${amount(quote.amount_yuan)}元，切换股票`);
    const track=el('span',null,'intraday-turnover-track'),bar=el('span');bar.style.width=`${quote.amount_yuan/max*100}%`;track.append(bar);
    button.append(el('span',`${quote.name||quote.code} ${quote.code}`),track,el('strong',amount(quote.amount_yuan)));
    button.addEventListener('click',()=>selection.onSelect(quote.code));turnover.append(button);
  }
}
function timingChart(parent,label,history,target){
  const series=timingSeries(history,target);
  parent.append(el('h4',`${label} · 目标${target}秒`, 'intraday-timing-heading'));
  if(!series.slots.length){empty(parent,'暂无该类型的完成记录');return;}
  parent.append(el('p',`有效记录${series.measured.length}轮 · 中位数${series.p50==null?'—':fixed(series.p50)+'秒'} / P95 ${series.p95==null?'—':fixed(series.p95)+'秒'}${series.excluded?` · ${series.excluded}条中断或无效时长单列，不计耗时分布`:''}`,'intraday-timing-note'));
  const plot=chart(`${label}最近20轮耗时，秒；中断停机时长不作为采集耗时`,110),max=Math.max(target*1.2,...series.measured.map(item=>item.elapsed_seconds)),y=value=>78-value/max*60,width=650/series.slots.length;
  plot.append(svgElement('line',{x1:64,x2:730,y1:y(target),y2:y(target),stroke:'#bc7e22','stroke-dasharray':'5 4'}),
    svgElement('text',{x:58,y:y(target)+4,'text-anchor':'end','font-size':11,fill:'#916119'},target+'秒'));
  for(const [index,item]of series.slots.entries()){
    if(item.interrupted||!item.valid){
      const marker=svgElement('text',{x:68+index*width+width/2,y:76,'text-anchor':'middle',fill:'#b96b27','font-size':14},'×');
      title(marker,`${shortTime(item.at)} · ${item.error||'时长无效'}；保留原记录，不将停机间隔当作抓取耗时`);plot.append(marker);continue;
    }
    const bar=svgElement('rect',{x:68+index*width,y:y(item.elapsed_seconds),width:Math.max(2,width-5),height:item.elapsed_seconds/max*60,
      fill:item.observation_only?'#96a5b5':item.complete?'#146eb4':'#ce8b37'});
    title(bar,`${shortTime(item.at)} · ${fixed(item.elapsed_seconds)}秒 · ${item.observation_only?'休市采样':item.complete?'完整新鲜':'未通过完整时效检查'}`);plot.append(bar);
  }
  plot.append(svgElement('text',{x:64,y:101,'font-size':11,fill:'#607086'},'较早'),svgElement('text',{x:730,y:101,'text-anchor':'end','font-size':11,fill:'#607086'},'最近'));
  parent.append(plot);
}

export function renderIntradayCharts(panel, status, selection) {
  const field = (name) => panel.querySelector(`[data-chart="${name}"]`);
  const quotes = selectedQuotes(status,selection.source),snapshot=poolSnapshot(status,selection.source);
  const codes = status.codes || [];
  const query=(selection.filter||'').trim().toLowerCase(),matches=code=>`${code} ${quotes.find(q=>q.code===code)?.name||''}`.toLowerCase().includes(query);
  poolCharts(field,status,selection,snapshot);
  const selected = quotes.find((quote) => quote.code === selection.code);
  const name = selected?.name || status.quotes?.find((q) => q.code === selection.code)?.name || selection.code;
  const pct = changePercent(selected);
  const changes = field('changes'),rankScroll=changes._filter===query?(changes.scrollTop||0):0;changes._filter=query;changes.replaceChildren();
  const sorted = [...quotes].sort((a, b) => (changePercent(b) ?? -Infinity) - (changePercent(a) ?? -Infinity));
  const scale = Math.max(1, ...quotes.map((q) => Math.abs(changePercent(q) ?? 0)));
  const listed=[...sorted.map((q) => q.code), ...codes.filter((code) => !quotes.some((q) => q.code === code))].filter(matches);
  field('ranking-note').textContent=`显示${listed.length}/${codes.length}只 · 缺失单列，排名不代表推荐。`;
  for (const code of listed) {
    const q = quotes.find((q) => q.code === code);
    const value = changePercent(q);
    const button = el('button', null, `intraday-change-row${code === selection.code ? ' selected' : ''}`);
    button.type = 'button'; button.setAttribute('aria-pressed', String(code === selection.code));
    button.append(el('span', `${q?.name || code} ${code}${q?.cached?' · 缓存':''}${q&&chinaDay(q.source_time)!==snapshot.day?' · 其他日期':''}`, 'intraday-stock-label'));
    const track = el('span', null, 'intraday-change-track');
    const bar = el('span', null, `intraday-change-bar ${value > 0 ? 'rise' : value < 0 ? 'fall' : 'flat'}`);
    bar.style.width = `${Math.abs(value ?? 0) / scale * 50}%`;
    bar.style.left = value < 0 ? `${50 - Math.abs(value) / scale * 50}%` : '50%';
    track.append(bar); button.append(track);
    button.append(el('strong', value == null ? '缺失' : `${value > 0 ? '+' : ''}${value.toFixed(2)}%`, value > 0 ? 'rise-text' : value < 0 ? 'fall-text' : ''));
    button.addEventListener('click', () => selection.onSelect(code)); changes.append(button);
  }
  if (!listed.length) empty(changes, codes.length?'没有匹配的股票，可清空筛选。':'等待股票池首次报价采集。');
  changes.scrollTop=rankScroll;
  const summary = field('selected'); summary.replaceChildren();
  summary.append(el('strong', `${name} ${selection.code || ''}`), el('span', selected ? ` 最新 ${fixed(selected.last)}元 · 较昨收 ${pctText(pct)} · ${sourceLabel(selected.source)} · 源时间${chinaDay(selected.source_time)||'未知'} ${quoteTime(selected.source_time)}${selected.cached ? ' · 本轮缺失，显示上次成功' : ''}` : '当前报价来源缺失'));
  const metrics=field('selected-metrics');metrics.replaceChildren();
  const spread=selected?.bids?.[0]?.price>0&&selected?.asks?.[0]?.price>=selected.bids[0].price?selected.asks[0].price-selected.bids[0].price:null;
  const amplitude=selected?.previous_close>0&&selected?.low>0&&selected?.high>=selected.low?(selected.high-selected.low)/selected.previous_close*100:null;
  metric(metrics,'开盘 / 昨收',`${fixed(selected?.open)} / ${fixed(selected?.previous_close)}`,'元 · 报价来源');
  metric(metrics,'日内高 / 低',`${fixed(selected?.high)} / ${fixed(selected?.low)}`,`振幅${pctText(amplitude)}`);
  metric(metrics,'累计成交量',Number.isFinite(selected?.volume_shares)?amount(selected.volume_shares)+'股':'缺失','报价源累计值');
  metric(metrics,'累计成交额',Number.isFinite(selected?.amount_yuan)?amount(selected.amount_yuan)+'元':'缺失',`买卖一价差${spread==null?'缺失':fixed(spread)+'元'}`);

  const health = field('health'),healthScroll=health._filter===query?(health.scrollTop||0):0;health._filter=query;health.replaceChildren();
  for (const code of codes.filter(matches)) {
    const q = quotes.find((quote) => quote.code === code);
    const minute = status.minutes?.find((entry) => entry.code === code);
    const label = !q ? '报价缺失' : q.cached ? '上次成功报价' : status.current_context !== 'trading' ? '休市样本' : q.fresh ? '90秒内' : '报价滞后';
    const button = el('button', null, `intraday-health-item ${!q ? 'missing' : status.current_context !== 'trading' ? 'closed' : !q.cached&&q.fresh ? 'fresh' : 'stale'}`);
    button.type = 'button';
    button.append(el('strong', q?.name || code), el('span', `${code} · ${label}`),
      el('small', q ? `源时间 ${quoteTime(q.source_time)}` : '未返回有效报价'),
      el('small', status.minute_codes && !status.minute_codes.includes(code) ? '未启用分钟采集' : minute?.current_ok ? `分钟${status.current_context === 'trading' && !minute.fresh ? '滞后' : '已获取'} · ${sourceLabel(minute.data.source)}` : minute?.data ? '分钟保留上次成功样本' : '分钟缺失'));
    button.addEventListener('click', () => selection.onSelect(code)); health.append(button);
  }
  health.scrollTop=healthScroll;
  const healthSummary=field('health-summary');healthSummary.replaceChildren();
  const minutes=(status.minutes||[]).filter(entry=>(status.minute_codes||codes).includes(entry.code));
  metric(healthSummary,'所选来源报价',`${quotes.length}/${codes.length}`,`当前列表${listed.length}只，概览不随筛选缩小`);
  metric(healthSummary,'盘中及时报价',`${snapshot.fresh}/${codes.length}`,status.current_context==='trading'?'本轮、非缓存且通过现有时效门槛':'当前休市，不判定实时达标');
  metric(healthSummary,'最近报告分钟覆盖',`${minutes.filter(entry=>entry.current_ok&&!entry.cached).length}/${(status.minute_codes||codes).length}`,`取得样本不代表闭合 · 策略可用${Number.isFinite(status.minute_readiness?.strategy_eligible_stocks)?status.minute_readiness.strategy_eligible_stocks+'只':'待核实'}`);

  const book = field('book'); book.replaceChildren();
  if (selected?.bids?.length && selected?.asks?.length) {
    const max = Math.max(1, ...[...selected.bids, ...selected.asks].map((level) => level.shares));
    for (let i = 0; i < Math.min(5, selected.bids.length, selected.asks.length); i++) {
      const row = el('div', null, 'intraday-book-row');
      const bid = selected.bids[i], ask = selected.asks[i];
      row.append(el('span', `买${i+1} ${bid.price.toFixed(2)}`));
      const buyBar = el('span', amount(bid.shares), 'intraday-book-bar bid'); buyBar.style.width = `${bid.shares / max * 100}%`;
      const sellBar = el('span', amount(ask.shares), 'intraday-book-bar ask'); sellBar.style.width = `${ask.shares / max * 100}%`;
      const buyTrack = el('span', null, 'intraday-book-track'); buyTrack.append(buyBar);
      const sellTrack = el('span', null, 'intraday-book-track'); sellTrack.append(sellBar);
      row.append(buyTrack, sellTrack, el('span', `卖${i+1} ${ask.price.toFixed(2)}`)); book.append(row);
    }
    book.append(el('small', '数量单位：股。挂单快照不代表实际成交；红买绿卖仅用于区分方向。'));
  } else empty(book, '当前来源没有可展示的盘口。');

  const minute = status.minutes?.find((entry) => entry.code === selection.code);
  const price = field('price'), volume = field('volume'); price.replaceChildren(); volume.replaceChildren();
  const rows = dayRows(minute?.data);
  const candleMode=selection.priceView==='candles'||['week','month'].includes(selection.candlePeriod);
  field('viewport-controls').hidden=!candleMode;
  field('candle-inspector').hidden=!candleMode;
  field('price-title').textContent='分钟价格 · 元 · 蓝线收盘价 / 金线样本均价 / 灰虚线昨收';
  const averages=sampleAverages(rows),metricKey=selection.activityMetric==='amount'?'amount_yuan':'volume_shares',metricUnit=metricKey==='amount_yuan'?'元':'股';
  field('activity-title').textContent=metricKey==='amount_yuan'?'分钟成交额（元 · 非当日累计额）':'分钟成交量（股 · 非当日累计量）';
  field('minute-note').textContent = rows.length
    ? `${chinaDay(rows[0].time)} · ${sourceLabel(minute.data.source)} · ${rows.length}条 · 源时间截至 ${shortTime(rows.at(-1).time)} · ${minute.cached ? '本轮失败，显示上次成功数据' : '最近报告获取'}。分钟闭合规则待盘中验证；缺口断开，不补零。`
    : status.minute_codes && !status.minute_codes.includes(selection.code) ? '该股票仅启用报价，未启用分钟采集。' : '分钟数据尚未获取成功；不会用报价采样点冒充分钟走势。';
  const readiness=status.minute_readiness?.stocks?.find(stock=>stock.code===selection.code);
  if(readiness)field('minute-note').textContent+=` 使用规则：接收时可能形成中${readiness.counts?.possible_forming||0}根，边界待核实${readiness.counts?.boundary_unverified||0}根，闭合待验证${readiness.counts?.closure_unverified||0}根；当前策略不可用。`;
  if(rows.length)field('minute-note').textContent+=averages.some(row=>row.average!=null)?' 金线为已取得分钟样本的累计成交额÷成交量；存在缺口时不代表全日均价。':' 来源量额不足，不绘制样本均价线。';
  if(rows.length&&selected&&chinaDay(selected.source_time)!==chinaDay(rows[0].time))field('minute-note').textContent+=' 报价与分钟日期不同，昨收参考线已隐藏。';
  if(candleMode){
    renderCandleCharts(panel,status,selection,minute);
  } else if (!rows.length) {
    empty(price, '该股票暂无可展示的分钟价格数据'); empty(volume, '该股票暂无可展示的分钟成交量');
  } else {
    const day=chinaDay(rows[0].time),start = Date.parse(day + 'T09:30:00+08:00');
    const x = (time) => 64 + (Date.parse(time) - start) / (330 * 60_000) * 672;
    const previousClose=selected?.previous_close>0&&chinaDay(selected.source_time)===day?selected.previous_close:null;
    const values = [...rows.map((r) => r.close),...averages.map(r=>r.average).filter(v=>v!=null),...(previousClose?[previousClose]:[])];
    const min = Math.min(...values), max = Math.max(...values), padding = Math.max((max - min) * .12, .01);
    const bottom = min - padding, top = max + padding;
    const y = (p) => 194 - (p - bottom) / (top - bottom) * 166;
    const activityRows=rows.filter(row=>Number.isFinite(row[metricKey])&&row[metricKey]>=0),maxVolume = Math.max(1, ...activityRows.map((r) => r[metricKey]));
    const plot = chart(`${name}分钟收盘价与样本累计均价，元，闭合待验证`, 236), vol = chart(`${name}分钟${metricKey==='amount_yuan'?'成交额':'成交量'}，${metricUnit}`, 150);
    for (const [target, floor] of [[plot, 194], [vol, 108]]) {
      target.append(svgElement('rect', { x: x(day+'T11:30:00+08:00'), y: 18, width: 672*90/330, height: floor-18, fill: '#eef2f6' }));
      target.append(svgElement('text', { x: 430, y: 32, fill: '#708090', 'font-size': 11 }, '午间休市'));
      for (const t of ['09:30', '10:30', '11:30', '13:00', '14:00', '15:00']) {
        const position = x(day + `T${t}:00+08:00`);
        target.append(svgElement('text', { x: position, y: floor + 22, 'text-anchor': 'middle', fill: '#607086', 'font-size': 11 }, t));
      }
    }
    for (let i = 0; i <= 4; i++) {
      const value = bottom + (top-bottom)*i/4;
      plot.append(svgElement('line', { x1: 64, x2: 736, y1: y(value), y2: y(value), stroke: '#e4ebf2' }),
        svgElement('text', { x: 56, y: y(value)+4, 'text-anchor': 'end', 'font-size': 11, fill: '#607086' }, value.toFixed(2)));
    }
    vol.append(svgElement('text', { x: 60, y: 20, 'text-anchor': 'end', 'font-size': 11, fill: '#607086' }, `${amount(maxVolume)}${metricUnit}`),
      svgElement('text', { x: 56, y: 110, 'text-anchor': 'end', 'font-size': 11, fill: '#607086' }, '0'));
    if(previousClose){const baseline=svgElement('line',{x1:64,x2:736,y1:y(previousClose),y2:y(previousClose),stroke:'#8793a3','stroke-dasharray':'5 4'});title(baseline,`昨收 ${fixed(previousClose)}元`);plot.append(baseline);}
    for (const segment of lineSegments(rows)) {
      plot.append(svgElement('polyline', { points: segment.map((r) => `${x(r.time)},${y(r.close)}`).join(' '), fill: 'none', stroke: '#146eb4', 'stroke-width': 1.8 }));
      if (segment.length === 1) plot.append(svgElement('circle', { cx: x(segment[0].time), cy: y(segment[0].close), r: 2, fill: '#146eb4' }));
    }
    for(const segment of lineSegments(averages.filter(row=>row.average!=null)))plot.append(svgElement('polyline',{
      points:segment.map(row=>`${x(row.time)},${y(row.average)}`).join(' '),fill:'none',stroke:'#ad7920','stroke-width':1.5,'stroke-dasharray':'4 2'}));
    for (const r of rows) {
      const tooltip = `${shortTime(r.time)} 开${fixed(r.open)} 高${fixed(r.high)} 低${fixed(r.low)} 收${fixed(r.close)}元；分钟量${amount(r.volume_shares)}股；分钟额${amount(r.amount_yuan)}元`;
      const hit = svgElement('circle', { cx: x(r.time), cy: y(r.close), r: 4, fill: 'transparent' }); title(hit, tooltip); plot.append(hit);
      if(!Number.isFinite(r[metricKey])||r[metricKey]<0)continue;
      const height = r[metricKey]/maxVolume*80;
      const bar = svgElement('rect', { x: x(r.time)-.8, y: 108-height, width: 1.6, height, fill: r.close >= r.open ? '#d44c52' : '#13906f' }); title(bar, tooltip); vol.append(bar);
    }
    price.append(plot);if(activityRows.length)volume.append(vol);else empty(volume,`来源没有有效的分钟${metricKey==='amount_yuan'?'成交额':'成交量'}，不以其他指标代替。`);
  }
  const latency = field('latency'); latency.replaceChildren();
  if(status.split_collection)for(const [kind,label]of [['quote','报价'],['minute','分钟']]){
    const lane=status.lanes?.[kind];timingChart(latency,label,lane?.history||[],lane?.target_seconds||(kind==='quote'?15:60));
  }else timingChart(latency,'采集',status.scheduler?.history||[],60);
  latency.append(el('small','蓝：完整新鲜；橙：未通过时效；灰：休市采样；×：中断/时长无效。程序耗时不等于行情源到页面的延迟。'));
}
