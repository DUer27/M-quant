import test from 'node:test';
import assert from 'node:assert/strict';
import {intradayCandles} from '../assets/candle-data.js';
import {renderCandleCharts} from '../assets/candle-charts.js';
import {changeCandleViewport} from '../assets/candle-viewport.js';
const minute=(time,extra={})=>({time:`2026-11-27T${time}:00+08:00`,open:10,high:12,low:9,close:11,volume_shares:100,amount_yuan:1050,...extra});
const element=tag=>({tag,children:[],textContent:'',attrs:{},handlers:{},setAttribute(k,v){this.attrs[k]=v;},append(...nodes){this.children.push(...nodes);},replaceChildren(){this.children=[];},addEventListener(k,v){this.handlers[k]=v;}});
const all=(node,tag)=>[...(node.tag===tag?[node]:[]),...node.children.flatMap(child=>all(child,tag))];
function fixture(run){const old=globalThis.document,fields=new Map();globalThis.document={createElement:element,createElementNS:(_,tag)=>element(tag)};
  const panel={querySelector(selector){const key=selector.match(/"([^"]+)"/)[1];if(!fields.has(key))fields.set(key,element('div'));return fields.get(key);}};
  try{return run({panel,fields});}finally{globalThis.document=old;}}

test('day view preserves every source OHLC and zoom slices without modifying source data',()=>{
  const rows=Array.from({length:90},(_,i)=>minute(`${String(9+Math.floor((31+i)/60)).padStart(2,'0')}:${String((31+i)%60).padStart(2,'0')}`,{close:10+i*.001})),before=JSON.stringify(rows);
  const result=intradayCandles({rows},'30');assert.equal(result.total,90);assert.equal(result.rows.length,30);
  assert.equal(result.rows[0].open,rows[60].open);assert.equal(result.rows[0].close,rows[60].close);assert.equal(JSON.stringify(rows),before);
});
test('lunch is not a gap, minute gaps stay unfilled, invalid bars are isolated',()=>{
  const result=intradayCandles({rows:[minute('11:29'),minute('11:30'),minute('13:01'),minute('13:03'),minute('13:04',{high:5})]});
  assert.equal(result.suspected_missing_labels,1);assert.equal(result.invalid,1);assert.equal(result.rows.length,4);
});
test('equivalent duplicate times do not add candles and conflicting values stop drawing',()=>{
  const first=minute('09:31'),alias={...first,time:'2026-11-27T01:31:00Z'};
  const valid=intradayCandles({rows:[first,alias]});assert.equal(valid.duplicates,1);assert.equal(valid.rows.length,1);
  const invalid=intradayCandles({rows:[first,{...alias,close:10.5}]});assert.equal(invalid.conflicting,true);assert.deepEqual(invalid.rows,[]);
});
test('actual candle bodies and inspector expose OHLC, preserve focus and never invent closed status',()=>fixture(({panel,fields})=>{
  const rows=[minute('09:31'),minute('09:32',{open:11,close:10})],selection={code:'000001',candlePeriod:'intraday',activityMetric:'volume'};
  renderCandleCharts(panel,{automatic_enabled:false},selection,{data:{source:'sina.minute',adjust:'none',rows,pending_count:1}});
  assert.match(fields.get('minute-note').textContent,/不复权/);
  const groups=all(fields.get('price'),'g');assert.equal(groups.length,2);assert.equal(groups[0].children[1].attrs.fill,'#d44c52');
  assert.equal(groups[1].children[1].attrs.fill,'#13906f');groups[0].handlers.click();assert.match(fields.get('candle-inspector').textContent,/09:31/);
  renderCandleCharts(panel,{automatic_enabled:false},selection,{data:{source:'sina.minute',rows}});
  assert.match(fields.get('candle-inspector').textContent,/09:31/);assert.match(fields.get('minute-note').textContent,/自动采集当前暂停/);
  assert.match(fields.get('candle-inspector').textContent,/闭合待验证/);assert.ok(!JSON.stringify([...fields]).includes('NaN'));
}));
test('weekly missing amounts stay empty and unfinished periods get dashed candle bodies',()=>fixture(({panel,fields})=>{
  const bar={...minute('15:00'),label:'2026-11-23',period_start:'2026-11-23',period_end:'2026-11-29',amount_yuan:null,
    trading_days:4,expected_days:5,pending_count:1,calendar_known:true,observed_complete:false};
  const selection={code:'000001',candlePeriod:'week',activityMetric:'amount',candleHistory:{data:{code:'000001',period:'week',pool_version:2,rows:[bar],adjust:'qfq',as_of:'2026-11-26'}}};
  renderCandleCharts(panel,{configured_pool_version:2},selection,null);
  assert.equal(all(fields.get('price'),'g')[0].children[1].attrs['stroke-dasharray'],'3 2');
  assert.equal(all(fields.get('volume'),'svg').length,0);assert.match(fields.get('volume').children[0].textContent,/不.*零值替代/);
  assert.match(fields.get('minute-note').textContent,/前复权/);assert.match(fields.get('candle-inspector').textContent,/待到期1天/);
}));

test('default inspector follows new data until the user selects a historical candle',()=>fixture(({panel,fields})=>{
  const selection={code:'000001',candlePeriod:'intraday'},rows=[minute('09:31')],entry={data:{rows,source:'sina.minute'}};
  renderCandleCharts(panel,{},selection,entry);assert.equal(selection.candleFocus,undefined);
  rows.push(minute('09:32'));renderCandleCharts(panel,{},selection,entry);assert.match(fields.get('candle-inspector').textContent,/09:32/);
}));

test('whole missing weeks retain horizontal gaps instead of squeezing candles together',()=>fixture(({panel,fields})=>{
  const bar={...minute('15:00'),period_start:'2026-11-02',period_end:'2026-11-08',label:'2026-11-02',observed_complete:true};
  const rows=[bar,{...bar,period_start:'2026-11-09',period_end:'2026-11-15',label:'2026-11-09'},
    {...bar,period_start:'2026-11-23',period_end:'2026-11-29',label:'2026-11-23'}];
  renderCandleCharts(panel,{configured_pool_version:2},{code:'000001',candlePeriod:'week',candleHistory:{data:{code:'000001',period:'week',pool_version:2,rows,missing_period_count:1}}},null);
  const x=all(fields.get('price'),'g').map(group=>Number(group.children[0].attrs.x1));
  assert.equal(x[2]-x[1],2*(x[1]-x[0]));assert.match(fields.get('minute-note').textContent,/整期未取得日线/);
}));

test('zoom redraws price and volume with identical candle ranges and Ctrl-wheel anchors a real label',()=>fixture(({panel,fields})=>{
  const rows=Array.from({length:40},(_,i)=>minute(`10:${String(i).padStart(2,'0')}`)),entry={data:{rows,source:'sina.minute'}};
  let action;const selection={code:'000001',candlePeriod:'intraday',onViewport(value){action=value;}};
  renderCandleCharts(panel,{},selection,entry);
  selection.candleViewport=changeCandleViewport(selection.candleViewportModel,{type:'zoom',direction:'in'});
  renderCandleCharts(panel,{},selection,entry);
  assert.equal(all(fields.get('price'),'g').length,20);
  assert.equal(all(fields.get('volume'),'rect').filter(node=>node.children.some(child=>child.tag==='title')).length,20);
  const svg=all(fields.get('price'),'svg')[0];svg.getBoundingClientRect=()=>({left:0,width:760});let prevented=false;
  svg.handlers.wheel({ctrlKey:false,deltaY:-100,clientX:400,preventDefault(){prevented=true;}});assert.equal(action,undefined);
  svg.handlers.wheel({ctrlKey:true,deltaY:-100,clientX:400,preventDefault(){prevented=true;}});
  assert.equal(action.type,'zoom');assert.equal(action.direction,'in');assert.ok(rows.some(row=>row.time===action.anchor));assert.equal(prevented,true);
}));
