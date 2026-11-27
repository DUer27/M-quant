import {chinaTime} from './market-data.js';

const names={'sina.minute':'新浪分钟','eastmoney.minute':'东方财富分钟'};
const fields={open:'开',high:'高',low:'低',close:'收',volume_shares:'成交量',amount_yuan:'成交额'};
const number=value=>Number.isFinite(value)?value.toLocaleString('zh-CN',{maximumFractionDigits:2}):'—';
const expanded=new Map();

export function renderMinuteFormation(root,formation){
  if(!formation)return;
  const text=value=>{const p=document.createElement('p');p.textContent=value;root.append(p);};
  if(!formation.sources?.length){text('同一分钟跨轮对照：尚无可比较的真实盘中记录。');return;}
  text('同一分钟跨轮对照：'+formation.note);
  for(const source of formation.sources){
    text(`${names[source.source]||source.source} · ${source.observations}轮独立观测 · 标签推进${source.label_advances}次 / 停滞${source.label_stagnations}次 / 倒退${source.label_regressions}次 · 重叠比较${source.overlap_comparisons}次 / 修订${source.revision_comparisons}次 · 已见后续标签后修订${source.revisions_after_later_label}次。最近接收${chinaTime(source.last_received_at)}。`);
    const present=source.boundary_observations||{},boundaries=['09:30','11:30','13:00','14:57','15:00'];
    text('边界标签留存：'+boundaries.map(label=>`${label} ${present[label]?`已见${present[label]}轮`:'未见'} / 附近接收${source.boundary_nearby_receipts?.[label]||0}轮`).join('；')+'。附近指标签后180秒内接收；午后响应含午间旧标签不算午间附近观测。未见不等于缺失，已见不代表闭合。');
    const details=document.createElement('details'),summary=document.createElement('summary');
    const expansionKey=[formation.day,formation.code,source.source,source.adjust].join(':');
    details.open=!!expanded.get(expansionKey);
    details.addEventListener('toggle',()=>{expanded.set(expansionKey,details.open);if(expanded.size>100)expanded.delete(expanded.keys().next().value);});
    summary.textContent=`展开最近${source.recent_labels?.length||0}个标签的价格与成交量对照（仅观察）`;details.append(summary);
    const wrap=document.createElement('div');wrap.className='intraday-table-scroll';
    const table=document.createElement('table'),head=document.createElement('tr');
    for(const title of ['分钟标签','首次归档接收','最近归档接收','最近开 / 高 / 低 / 收','成交量（股）','成交额（元）','观测轮数','修订次数','后续标签']){
      const th=document.createElement('th');th.textContent=title;head.append(th);
    }table.append(head);
    for(const row of source.recent_labels||[]){
      const tr=document.createElement('tr'),v=row.values||{};
      for(const value of [chinaTime(row.label),chinaTime(row.first_seen_at),chinaTime(row.last_seen_at),
        ['open','high','low','close'].map(key=>number(v[key])).join(' / '),number(v.volume_shares),number(v.amount_yuan),
        row.observations,row.revisions,row.later_label_seen?'已见，闭合待验证':'尚未见']){
        const td=document.createElement('td');td.textContent=String(value);tr.append(td);
      }table.append(tr);
    }wrap.append(table);details.append(wrap);
    for(const change of source.recent_changes||[]){
      const p=document.createElement('p');
      p.textContent=`修订记录：${chinaTime(change.label)}，${chinaTime(change.received_at)}收到；`+
        (change.fields||[]).map(key=>`${fields[key]||key} ${number(change.previous?.[key])} → ${number(change.current?.[key])}`).join('；')+
        (change.after_later_label_observed?'。此前已见后续标签，仍发生修订。':'。仅代表两次归档值不同。');
      details.append(p);
    }root.append(details);
  }
}
