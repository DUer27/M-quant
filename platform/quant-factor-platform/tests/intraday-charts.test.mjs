import assert from 'node:assert/strict';
import test from 'node:test';
import { changePercent, dayRows, lineSegments, renderIntradayCharts } from '../assets/intraday-charts.js';

export function fakeDocument() {
  const fields = new Map();
  function element(tag) {
    return { tag, children: [], style: {}, attrs: {}, handlers: {}, textContent: '',
      setAttribute(key, value) { this.attrs[key] = value; }, append(...children) { this.children.push(...children); },
      replaceChildren() { this.children = []; }, addEventListener(name, handler) { this.handlers[name] = handler; } };
  }
  const panel = { querySelector(selector) {
    const name = selector.match(/"([^"]+)"/)[1];
    if (!fields.has(name)) fields.set(name, element('div'));
    return fields.get(name);
  } };
  return { fields, panel, document: { createElement: element, createElementNS: (_, tag) => element(tag) } };
}
function nodes(node, tag) { return [...(node.tag === tag ? [node] : []), ...node.children.flatMap((child) => nodes(child, tag))]; }
const at = (time) => `2026-11-24T${time}:00+08:00`;
const minute = (time, close = 10, volume = 100) => ({ time: at(time), open: 10, close, volume_shares: volume });

test('percent change uses previous close and never makes a missing baseline zero', () => {
  assert.ok(Math.abs(changePercent({ last: 11, previous_close: 10 }) - 10) < 1e-9);
  assert.ok(changePercent({ last: 9, previous_close: 10 }) < 0);
  assert.equal(changePercent({ last: 10, previous_close: 0 }), null);
  assert.equal(changePercent({ last: 10 }), null);
});

test('line segments break on missing minutes and lunch, and exclude other dates', () => {
  const rows = [minute('09:31'), minute('09:32'), minute('09:34'), minute('11:30'), minute('13:00')];
  assert.equal(lineSegments(rows).length, 4);
  assert.equal(lineSegments(rows)[0].length, 2);
  assert.equal(dayRows({ rows: [{ ...minute('15:00'), time: '2026-11-23T15:00:00+08:00' }, ...rows] }).length, 5);
});

test('charts use chosen quote source, preserve minute gaps and expose selection clicks', () => {
  const dom = fakeDocument(), previous = globalThis.document;
  globalThis.document = dom.document;
  try {
    const quote = { code: '000001', name: 'fixture', source: 'sina.quote', last: 10, previous_close: 10,
      source_time: at('15:00'), bids: [{ price: 9.9, shares: 100 }], asks: [{ price: 10.1, shares: 200 }] };
    let clicked = '';
    const status = { codes: ['000001', '000063'], current_context: 'market_closed', quotes: [quote, { ...quote, source: 'tencent.quote', last: 20 }],
      minutes: [{ code: '000001', cached: true, data: { source: 'sina.minute', rows: [minute('09:31'), minute('09:32', 10.2, 200), minute('09:34', 10.1)] } }] };
    const selection = { code: '000001', source: 'sina.quote', onSelect: (code) => { clicked = code; } };
    renderIntradayCharts(dom.panel, status, selection);
    assert.equal(dom.fields.get('changes').children.length, 2);
    assert.equal(dom.fields.get('changes').children[0].children.at(-1).textContent, '0.00%');
    dom.fields.get('changes').children[1].handlers.click(); assert.equal(clicked, '000063');
    const price = dom.fields.get('price');
    assert.equal(nodes(price, 'polyline').length, 2);
    assert.ok(!JSON.stringify(price).includes('NaN'));
    assert.equal(nodes(dom.fields.get('volume'), 'rect').filter((node) => node.children.some((child) => child.tag === 'title')).length, 3);
    assert.match(dom.fields.get('minute-note').textContent, /本轮失败，显示上次成功数据/);
    assert.match(dom.fields.get('minute-note').textContent, /新浪/);
    assert.match(dom.fields.get('health').children[0].children[1].textContent, /休市样本/);
    selection.code = '000063'; renderIntradayCharts(dom.panel, status, selection);
    assert.equal(nodes(dom.fields.get('price'), 'svg').length, 0);
    assert.match(dom.fields.get('price').children[0].textContent, /暂无/);
  } finally { globalThis.document = previous; }
});

test('activity switches use real minute amounts and weighted sample lines keep gaps',()=>{
  const dom=fakeDocument(),previous=globalThis.document;globalThis.document=dom.document;
  try{
    const rows=[{...minute('09:31'),amount_yuan:1000},{...minute('09:33',11,200),amount_yuan:2200}];
    const status={codes:['000001'],quotes:[],minutes:[{code:'000001',data:{source:'sina.minute',rows}}]};
    renderIntradayCharts(dom.panel,status,{code:'000001',source:'sina.quote',activityMetric:'amount',onSelect(){}});
    assert.match(dom.fields.get('activity-title').textContent,/成交额/);
    assert.match(nodes(dom.fields.get('volume'),'svg')[0].attrs['aria-label'],/成交额，元/);
    assert.equal(nodes(dom.fields.get('price'),'polyline').length,4);assert.match(dom.fields.get('minute-note').textContent,/不代表全日均价/);
    status.minutes[0].data.rows=rows.map(({amount_yuan,...row})=>row);
    renderIntradayCharts(dom.panel,status,{code:'000001',source:'sina.quote',activityMetric:'amount',onSelect(){}});
    assert.equal(nodes(dom.fields.get('volume'),'svg').length,0);assert.match(dom.fields.get('volume').children[0].textContent,/不以其他指标代替/);
  }finally{globalThis.document=previous;}
});

test('filtering lists preserves pool totals and refresh preserves their scroll positions',()=>{
  const dom=fakeDocument(),previous=globalThis.document;globalThis.document=dom.document;
  try{
    const status={codes:['000001','600519'],quotes:[{code:'000001',name:'平安银行',source:'sina.quote',last:10,previous_close:10,source_time:at('14:00')}],minutes:[]};
    const selection={code:'000001',source:'sina.quote',filter:'平安',onSelect(){}};
    renderIntradayCharts(dom.panel,status,selection);
    assert.equal(dom.fields.get('changes').children.length,1);assert.equal(dom.fields.get('health').children.length,1);
    assert.equal(dom.fields.get('overview').children[0].children[1].textContent,'1/2');
    dom.fields.get('changes').scrollTop=88;dom.fields.get('health').scrollTop=44;
    renderIntradayCharts(dom.panel,status,selection);assert.equal(dom.fields.get('changes').scrollTop,88);assert.equal(dom.fields.get('health').scrollTop,44);
    selection.filter='not found';renderIntradayCharts(dom.panel,status,selection);assert.match(dom.fields.get('changes').children[0].textContent,/没有匹配/);
    assert.equal(dom.fields.get('changes').scrollTop,0);
  }finally{globalThis.document=previous;}
});

test('split durations use both lane histories and mark interrupted slots separately',()=>{
  const dom=fakeDocument(),previous=globalThis.document;globalThis.document=dom.document;
  try{
    const status={codes:[],quotes:[],split_collection:true,lanes:{quote:{target_seconds:15,history:[{at:at('14:00'),elapsed_seconds:1,complete:true}]},
      minute:{target_seconds:60,history:[{at:at('14:00'),elapsed_seconds:31,complete:true},{at:at('14:01'),elapsed_seconds:27482,error:'上次独立任务中断'}]}}};
    renderIntradayCharts(dom.panel,status,{source:'sina.quote',onSelect(){}});
    const latency=dom.fields.get('latency');assert.equal(nodes(latency,'svg').length,2);
    assert.ok(nodes(latency,'text').some(node=>node.textContent==='×'));
    assert.ok(!JSON.stringify(dom.fields.get('price')).includes('NaN'));
  }finally{globalThis.document=previous;}
});
