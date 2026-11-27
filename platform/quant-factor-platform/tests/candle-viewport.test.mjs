import test from 'node:test';
import assert from 'node:assert/strict';
import {candleViewport,changeCandleViewport} from '../assets/candle-viewport.js';
const rows=Array.from({length:238},(_,i)=>({label:String(i),open:10+i*.01}));
test('zoom changes visible bounds only and price and volume can share the same immutable rows',()=>{
  const before=JSON.stringify(rows),full=candleViewport(rows,'day');
  const state=changeCandleViewport(full,{type:'zoom',direction:'in'}),zoom=candleViewport(rows,'day',state);
  assert.equal(full.size,238);assert.equal(zoom.size,119);assert.equal(zoom.end,238);assert.equal(zoom.rows[0],rows[119]);
  assert.equal(JSON.stringify(rows),before);assert.equal(changeCandleViewport(zoom,{type:'zoom',direction:'out'}).size,null);
});
test('earlier pan pins the historical end across live appends and latest resumes following',()=>{
  const start=candleViewport(rows,'day',null,'60'),state=changeCandleViewport(start,{type:'pan',direction:'earlier'});
  const old=candleViewport(rows,'day',state),next=candleViewport([...rows,{label:'238'}],'day',state);
  assert.equal(next.rows.at(-1).label,old.rows.at(-1).label);assert.equal(next.following,false);assert.ok(next.canLater);
  const latest=candleViewport([...rows,{label:'238'}],'day',changeCandleViewport(next,{type:'latest'}));
  assert.equal(latest.rows.at(-1).label,'238');assert.equal(latest.size,60);
});
test('zoom bounds and panning clamp at data edges without fabricating future candles',()=>{
  let view=candleViewport(rows,'day');for(let i=0;i<12;i++)view=candleViewport(rows,'day',changeCandleViewport(view,{type:'zoom',direction:'in'}));
  assert.equal(view.size,10);assert.equal(view.canZoomIn,false);
  for(let i=0;i<60;i++)view=candleViewport(rows,'day',changeCandleViewport(view,{type:'pan',direction:'earlier'}));
  assert.equal(view.start,0);assert.equal(view.canEarlier,false);assert.equal(view.rows.length,10);
});
test('reset, new day and new stock cannot leak another viewport',()=>{
  const view=candleViewport(rows,'day',null,'30'),state=changeCandleViewport(view,{type:'pan',direction:'earlier'});
  assert.equal(candleViewport(rows,'new-day',state).size,238);
  assert.equal(candleViewport(rows,'day',changeCandleViewport(view,{type:'reset'})).size,238);
  assert.equal(candleViewport([],'day').size,0);assert.equal(changeCandleViewport(candleViewport([],'day'),{type:'zoom'}),null);
});
test('weekly and monthly zoom stay within loaded twelve bars and use a three-candle minimum',()=>{
  const bars=rows.slice(0,12),full=candleViewport(bars,'week',null,'all','week');
  const zoom=candleViewport(bars,'week',changeCandleViewport(full,{type:'zoom',direction:'in'}),'all','week');assert.equal(zoom.size,6);
  const min=candleViewport(bars,'week',changeCandleViewport(zoom,{type:'zoom',direction:'in'}),'all','week');assert.equal(min.size,3);assert.equal(min.canZoomIn,false);
});
test('wheel anchor remains inside the zoomed range at the same relative location',()=>{
  const full=candleViewport(rows,'day'),zoom=candleViewport(rows,'day',changeCandleViewport(full,{type:'zoom',direction:'in',anchor:'100'}));
  assert.ok(zoom.labels.indexOf('100')>=zoom.start&&zoom.labels.indexOf('100')<zoom.end);
  assert.ok(Math.abs((100-full.start)/full.size-(100-zoom.start)/zoom.size)<.02);
});
