import {chinaTime} from './market-data.js';
import {renderMinuteFormation} from './intraday-formation.js';

const states={possible_forming:'可能形成中（接收时）',boundary_unverified:'边界标签待核实',closure_unverified:'闭合待验证',isolated_future:'隔离的未来候选',missing:'暂无记录'};
const times={current:'本轮且在时效范围',cached:'上次成功缓存',historical:'历史日期',off_session:'休市样本',stale:'源时间滞后',missing:'没有分钟样本',invalid_time:'时间异常'};
const reasons={label_semantics_unverified:'来源标签含义未确认',closure_rule_unverified:'来源闭合规则未确认',no_verified_closed_bars:'暂无通过闭合验证的K线',
  not_current_collection:'本轮尚未更新或使用缓存',outside_trading_session:'不在交易时段',historical_data:'样本不是当前日期',not_fresh:'时间或本轮状态不满足',
  internal_gaps_unresolved:'存在内部疑似缺口',boundary_gaps_unverified:'紧邻时段边界的间隔待核实',cache_version_mismatch:'缓存与当前展示版本未对齐',missing_series:'没有有效分钟序列',
  unsupported_source:'来源未支持',unsupported_basis:'复权口径未支持',invalid_time:'来源或接收时间异常',invalid_receipt_time:'接收时间异常',
  duplicate_labels:'存在重复标签',invalid_label:'分钟标签异常',invalid_bar:'价格或成交量异常',cache_unreadable:'缓存无法读取',excessive_series:'序列长度异常',
  source_label_mismatch:'源时间与最后标签不一致',mixed_days:'样本混有多个日期'};
export function mountMinuteReadiness(panel,{isVisible=()=>true}={}){
  const field=name=>panel.querySelector(`[data-intraday="${name}"]`);
  let status=null,selected='',signature='',requestId=0,loaded=null,loadingKey='';
  const text=(parent,value)=>{const p=document.createElement('p');p.textContent=value;parent.append(p);};
  function show(detail){
    const root=field('readiness-details');root.replaceChildren();
    if(!detail){text(root,'选择核查样本后读取逐根标签。');return;}
    text(root,`${detail.code} · ${detail.source||'来源未知'} · ${times[detail.time_state]||detail.time_state} · 源时间${chinaTime(detail.source_time)} · 收到${chinaTime(detail.received_at)}`);
    text(root,'策略暂不可用：'+(detail.blocking_codes||[]).map(code=>reasons[code]||code).join('；'));
    text(root,`展示最近${detail.labels?.length||0}/${detail.labels_total||0}根已观察标签；形成中状态按原接收时刻判定，时间经过不自动确认闭合。`);
    const table=document.createElement('table'),head=document.createElement('tr');
    for(const value of ['标签（北京时间）','状态','同源观测次数','连续未变次数','修订次数','后续标签出现','策略使用']){const th=document.createElement('th');th.textContent=value;head.append(th);}table.append(head);
    for(const row of detail.labels||[]){const tr=document.createElement('tr'),e=row.evidence;
      for(const value of [chinaTime(row.label),states[row.state]||row.state,e?.observations??'未记录',e?.unchanged_observations??'未记录',e?.revisions??'未记录',e?e.later_label_seen?'是，仅作证据':'未见':'未记录','暂不可用']){
        const td=document.createElement('td');td.textContent=String(value);tr.append(td);
      }table.append(tr);
    }root.append(table);
    for(const gap of detail.gaps||[])text(root,`${gap.state==='boundary_gap_unverified'?'边界待核查':'内部疑似缺口'}：${chinaTime(gap.after)}—${chinaTime(gap.before)}之间${gap.candidate_labels}个标签。${gap.interpretation}`);
    if(detail.pending_labels?.length)text(root,'已隔离的未来候选：'+detail.pending_labels.map(chinaTime).join('、'));
    text(root,'多次不变或出现后续标签，只说明观测内容暂时稳定，仍不能替代来源闭合规则。');
  }
  async function load(){
    if(!status||!selected||!isVisible())return;
    const row=status.minute_readiness?.stocks?.find(s=>s.code===selected);
    const key=JSON.stringify([selected,row?.version,row?.run_id,row?.received_at,row?.time_state,row?.evidence_available,row?.current_collection]);
    if(signature===key&&loaded)return;
    if(loadingKey===key)return;
    loadingKey=key;
    const code=selected,id=++requestId;field('readiness-error').textContent='';
    try{const response=await fetch('/market-data-api/intraday/minute-readiness?code='+encodeURIComponent(code));
      if(!response.ok)throw new Error('逐根标签状态暂时无法读取');const detail=await response.json();
      if(id!==requestId||selected!==code||!isVisible())return;
      const current=status.minute_readiness?.stocks?.find(s=>s.code===code);
      if(current&&(detail.version!==current.version||detail.run_id!==current.run_id||detail.received_at!==current.received_at)){
        field('readiness-error').textContent='采集版本正在切换，等待下一次同步后重试。';return;
      }
      loaded=detail;signature=key;show(detail);
    }catch(error){if(id===requestId)field('readiness-error').textContent=error.message+'；保留上次显示，不能据此确认当前准入。';}
    finally{if(loadingKey===key)loadingKey='';}
  }
  async function render(value){
    status=value;const readiness=value.minute_readiness;
    const review=value.minute_source_verification;
    const sourceRoot=field('source-review-records');sourceRoot.replaceChildren();
    const references=field('source-review-references');references.replaceChildren();
    if(review){
      field('source-review-summary').textContent=`交易时段规则已有依据；分钟标签含义和闭合规则仍待验证。${review.day}已存档${review.deliveries}份响应，其中有效盘中观测${review.intraday_deliveries}份。${review.automatic_enabled?'随现有分钟采集记录证据。':'自动采集当前暂停；恢复采集或手动更新分钟后才会增加观测。'}${review.read_error||''}`;
      for(const ref of review.references||[]){const p=document.createElement('p'),a=document.createElement('a');a.textContent=ref.title;a.href=ref.url;a.target='_blank';a.rel='noopener noreferrer';p.append(a);references.append(p);}
      for(const stock of review.stocks||[]){const heading=document.createElement('h4');heading.textContent=`${stock.code} · 有效盘中${stock.intraday_deliveries}份 / 全部${stock.deliveries}份`;sourceRoot.append(heading);
        renderMinuteFormation(sourceRoot,stock.formation);
        if(!stock.recent?.length)text(sourceRoot,'等待首次边界证据记录。');
        for(const record of stock.recent||[]){const phases={morning_continuous:'上午连续竞价',morning_boundary:'午间边界',afternoon_continuous:'下午连续竞价',closing_auction:'收盘集合竞价',outside_session:'休市'};
          text(sourceRoot,`${chinaTime(record.received_at)} · ${record.source} · ${phases[record.receipt_phase]||record.receipt_phase} · ${record.origin==='imported_saved_delivery'?'从已保存响应导入，非新盘中观测':record.intraday_evidence?'盘中证据，闭合仍待验证':'未满足盘中证据条件'} · 最新标签${chinaTime(record.last_label)} · 保存${record.stored_labels}个重点标签`);
        }
      }
      const pending=field('source-review-pending');pending.replaceChildren();for(const item of review.remaining_evidence||[])text(pending,'待核实：'+item);
    }else field('source-review-summary').textContent='等待来源核实与边界观测记录。';
    if(!readiness){field('readiness-summary').textContent='等待分钟数据使用规则检查。';return;}
    field('readiness-summary').textContent=`分钟池${readiness.total}只 · 有观察样本${readiness.observation_stocks}只 · 可供策略使用${readiness.strategy_eligible_stocks}只 · 已验证闭合${readiness.verified_closed_bars}根 · 内部疑似缺口${readiness.suspected_gap_stocks}只 · 边界间隔待核查${readiness.boundary_gap_stocks||0}只。${readiness.note}`;
    const rows=field('readiness-rows');rows.replaceChildren();
    for(const stock of readiness.stocks||[]){const tr=document.createElement('tr'),counts=stock.counts||{};
      for(const value of [stock.code,times[stock.time_state]||stock.time_state,stock.observation_rows,counts.possible_forming||0,
        counts.boundary_unverified||0,counts.closure_unverified||0,counts.isolated_future||0,stock.suspected_missing_labels,stock.boundary_gap_labels||0,'暂不可用']){
        const td=document.createElement('td');td.textContent=String(value);tr.append(td);
      }rows.append(tr);
    }
    const sampleCodes=readiness.sample_codes||[];
    const select=field('readiness-stock');select.replaceChildren();
    for(const code of sampleCodes){const option=document.createElement('option');option.value=code;option.textContent=code;select.append(option);}
    if(!sampleCodes.includes(selected)){selected=sampleCodes[0]||'';signature='';loaded=null;requestId++;show(null);}
    select.value=selected;select.disabled=!sampleCodes.length;
    if(!sampleCodes.length){field('readiness-error').textContent='当前未配置分钟核查样本，可在股票数据管理库选择最多3只。';return;}
    await load();
  }
  field('readiness-stock').addEventListener('change',()=>{selected=field('readiness-stock').value;signature='';loaded=null;requestId++;show(null);load();});
  return {render};
}
