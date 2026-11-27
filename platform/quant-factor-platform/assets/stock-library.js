export function mountStockLibrary({isVisible=()=>true}={}) {
  const root=document.querySelector('#stock-library-panel');if(!root)return;
  const field=name=>root.querySelector(`[data-stock-library="${name}"]`);
  let library=null,draft=[],preview=null,dirty=false,loading=false;
  const message=text=>{field('message').textContent=text;};
  function changed(){dirty=true;preview=null;field('apply').disabled=true;field('prepare').disabled=true;field('review-gaps').disabled=true;field('preview').textContent='预览变更';message('有未保存修改。先预览变更，再保存供下一轮使用。');}
  function renderPreparation(){
    const state=library?.history_preparation;
    if(!state){field('preparation').textContent='历史准备状态暂不可用';return;}
    const labels={running:'准备中',checked:'基础校验完成',partial:'部分待准备',pending:'等待检查',interrupted:'上次中断',waiting:'等待其他任务',failed:'准备失败',not_started:'尚未开始'};
    const coverage=state.coverage||{};
    field('preparation').textContent=`${labels[state.state]||state.state} · 已校验${coverage.checked||0}/${coverage.total||0}只 · 待准备${coverage.queued||0}只 · 失败${coverage.failed||0}只 · 自动准备${state.enabled?'已开启':'已暂停'}${state.active_code?' · 当前'+state.active_code:''}。${state.message||''}${!state.quiet_time?'；交易时段优先最新行情，历史等待休市':''}${state.auto_retry_exhausted?'；本版本今日自动失败已达3批，等待明日或手动检查':state.next_retry_at&&state.state!=='checked'?'；下一次检查不早于'+new Date(state.next_retry_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}):''}`;
    field('prepare').disabled=dirty||state.state==='running';
    field('history-toggle').textContent=state.enabled?'暂停自动准备':'开启自动准备';
    const gaps=state.gap_review||{},rows=gaps.stocks||[],current=rows.filter(s=>s.current&&s.missing_dates?.length);
    const candidate=current.reduce((n,s)=>n+(s.dates||[]).filter(d=>d.state==='candidate_available').length,0);
    field('gap-summary').textContent=`疑似缺口${gaps.suspect_stocks??'待检查'}只 · 已核查${current.filter(s=>s.checked_at).length}只 · 找到候选${candidate}个日期 · 今日来源尝试${gaps.budget?.attempts||0}/${gaps.budget?.limit||12}次。${gaps.state==='running'?'正在核查 '+(gaps.active_code||''):gaps.message||'点击核查后查看逐股日期与来源证据。'}`;
    field('review-gaps').disabled=dirty||state.state==='running'||gaps.state==='running';
    field('prepare').disabled=field('prepare').disabled||gaps.state==='running';
    const details=field('gap-details');details.replaceChildren();
    const gapLabels={candidate_review:'找到候选，等待核实',absence_observed:'交叉来源也有缺失，原因未确认',unresolved:'来源未取到有效证据',queued:'等待下一批',stale:'缓存已变化，旧证据待复查',baseline_invalid:'历史基线需先准备'};
    for(const stock of rows.filter(s=>s.missing_dates?.length||s.state==='baseline_invalid')){
      const item=document.createElement('article'),heading=document.createElement('h4');heading.textContent=`${stock.code} ${stock.name||''} · ${gapLabels[stock.state]||stock.state}${stock.current?'':'（旧记录）'}`;item.append(heading);
      const baseline=document.createElement('p');baseline.textContent=`主历史：${stock.primary_source||'待确认'}；核查范围：${stock.window_start||'待检查'}—${stock.window_end||'待检查'}`;item.append(baseline);
      const dates=document.createElement('p');dates.textContent='缺失日期：'+(stock.missing_dates||[]).join('、');item.append(dates);
      if(stock.reason){const p=document.createElement('p');p.textContent=stock.reason;item.append(p);}
      for(const observation of stock.observations||[]){const p=document.createElement('p');
        p.textContent=`${observation.source}：${observation.state==='observed'?`找到${observation.found_dates.length}个缺失日期，仍缺${observation.absent_dates.length}个；重叠价格差异${observation.price_conflict_dates.length}个日期${observation.price_conflict_dates.length?'（'+observation.price_conflict_dates.join('、')+'）':''}；零成交量候选${observation.zero_volume_dates.length}个`:observation.reason||'未获得有效证据'}`;item.append(p);}
      if(stock.retryable){const p=document.createElement('p');p.textContent='部分来源待复查，不早于'+new Date(stock.next_retry_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'});item.append(p);}
      details.append(item);
    }
  }
  function render(){
    const count=key=>draft.filter(stock=>stock[key]).length;
    field('summary').textContent=`当前版本 v${library.version} · 管理库${draft.length}只 · 日线${count('daily')}只 · 报价${count('quote')}/50只 · 分钟${count('minute')}只 · 核查${count('audit')}/3只${dirty?' · 草稿未保存':''}`;
    renderPreparation();
    const query=field('search').value?.trim()||'',filter=field('filter').value||'all';
    const body=field('rows');body.replaceChildren();
    for(const stock of draft.filter(s=>!query||s.code.includes(query)||s.name.includes(query))){
      if(filter==='inactive'&&(stock.daily||stock.quote))continue;
      if(filter==='active'&&!stock.daily&&!stock.quote)continue;
      const tr=document.createElement('tr');
      const codeCell=document.createElement('td');codeCell.textContent=stock.code;tr.append(codeCell);
      const nameCell=document.createElement('td'),nameInput=document.createElement('input');nameInput.type='text';nameInput.value=stock.name;
      nameInput.setAttribute('aria-label',stock.code+'股票名称');nameInput.addEventListener('change',()=>{stock.name=nameInput.value.trim();changed();});nameCell.append(nameInput);tr.append(nameCell);
      for(const key of ['daily','quote','minute','audit']){
        const td=document.createElement('td'),input=document.createElement('input');input.type='checkbox';input.checked=stock[key];
        input.setAttribute('aria-label',`${stock.name}${{daily:'日线',quote:'报价',minute:'分钟',audit:'核查'}[key]}`);
        input.addEventListener('change',()=>{stock[key]=input.checked;if(key==='quote'&&!stock.quote){stock.minute=false;stock.audit=false;}
          if(key==='minute'){if(stock.minute)stock.quote=true;else stock.audit=false;}if(key==='audit'&&stock.audit){stock.minute=true;stock.quote=true;}
          changed();render();});td.append(input);tr.append(td);
      }
      const priority=document.createElement('td'),select=document.createElement('select');
      for(const [value,text]of [[0,'优先'],[1,'普通'],[2,'低优先']]){const option=document.createElement('option');option.value=String(value);option.textContent=text;select.append(option);}
      select.value=String(stock.priority);select.setAttribute('aria-label',stock.name+'采集优先级');select.addEventListener('change',()=>{stock.priority=Number(select.value);changed();});priority.append(select);tr.append(priority);
      const availability=document.createElement('td'),info=stock.availability||{};
      const history=info.daily_history;
      const dailyText=history?.current?`历史校验${history.rows}条 · 截至${history.as_of}${history.fresh?' · 日线日期已达标':' · 日线待更新'}${history.missing_sessions?' · '+history.missing_sessions+'个交易日待核查':''}`:history?.state==='failed'?`历史准备失败：${(history.reason||'需检查来源').slice(0,80)}`:info.daily_cache?'日线有历史缓存，待校验':'日线待准备';
      availability.textContent=[stock.daily?dailyText:'',stock.quote?(info.quote_time?'报价有缓存':'报价待首次采集'):'',stock.minute?(info.minute_time?'分钟有缓存':'分钟待首次采集'):''].filter(Boolean).join(' · ')||'管理库备用，未启用采集';
      availability.title=`历史准备：${history?.reason||history?.source||'未检查'}；报价源时间：${info.quote_time||'无'}；分钟源时间：${info.minute_time||'无'}。缓存存在不代表最新、完整或已闭合。`;tr.append(availability);
      const action=document.createElement('td'),stop=document.createElement('button');stop.type='button';stop.textContent='停止采集';stop.addEventListener('click',()=>{for(const key of ['daily','quote','minute','audit'])stock[key]=false;changed();render();});action.append(stop);tr.append(action);body.append(tr);
    }
    field('restore-version').replaceChildren();
    for(const version of library.versions||[library.version]){const option=document.createElement('option');option.value=String(version);option.textContent=`v${version}`;field('restore-version').append(option);}
  }
  async function request(body){const response=await fetch('/market-data-api/stock-library',body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:undefined);
    const result=await response.json();if(!response.ok)throw new Error(result.error||result.message||'股票池操作失败');return result;}
  async function refresh(force=false){if(loading||dirty&&!force)return;loading=true;try{library=await request();draft=library.stocks.map(stock=>({...stock}));dirty=false;preview=null;field('apply').disabled=true;render();message(`已加载 v${library.version}。${library.note}`);}catch(error){message(error.message);}finally{loading=false;}}
  async function showPreview(stocks=draft,reason='save'){
    try{const checked=await request({action:'preview',stocks,expected_version:library.version});preview={stocks:checked.stocks,reason};
      const list=field('changes');list.replaceChildren();
      for(const change of checked.changes){const line=document.createElement('p');const types={daily:'日线',quote:'报价',minute:'分钟',audit:'核查',name:'名称',priority:'优先级',removed_from_library:'移出管理库'};
        line.textContent=`${change.code} ${change.name}：${change.fields.map(key=>`${types[key]||key} ${change.before?.[key]??'无'} → ${change.after?.[key]??'无'}`).join('；')}`;list.append(line);}
      field('apply').disabled=!checked.changes.length;field('preview').textContent=`预览完成：${checked.changes.length}只变更`;
      message(`保存后生成v${checked.next_version}：日线${checked.counts.daily}只、报价${checked.counts.quote}只、分钟${checked.counts.minute}只。当前采集轮不改变；停采股票的历史保留。`);
    }catch(error){preview=null;field('apply').disabled=true;message(error.message);}
  }
  field('search').addEventListener('input',()=>library&&render());field('filter').addEventListener('change',()=>library&&render());
  field('reload').addEventListener('click',()=>refresh(true));
  field('prepare').addEventListener('click',async()=>{
    if(!library||dirty)return;field('prepare').disabled=true;
    try{const result=await request({action:'prepare-history',expected_version:library.version});await refresh(true);message(result.accepted?'历史准备已启动；只处理已保存名单，进度见上方。':result.reason);}catch(error){message(error.message);field('prepare').disabled=false;}
  });
  field('history-toggle').addEventListener('click',async()=>{
    if(!library?.history_preparation)return;
    try{const state=await request({action:'history-automatic',enabled:!library.history_preparation.enabled});library.history_preparation=state;renderPreparation();message(state.enabled?'已开启自动历史准备，休市且任务空闲时执行。':'已暂停后续自动历史准备；当前一批可完成。');}catch(error){message(error.message);}
  });
  field('review-gaps').addEventListener('click',async()=>{
    if(!library||dirty)return;field('review-gaps').disabled=true;
    try{const result=await request({action:'review-daily-gaps',expected_version:library.version});await refresh(true);message(result.accepted?'已启动缺口交叉核查，结果仅作为证据，主历史保留。':result.reason);}catch(error){message(error.message);field('review-gaps').disabled=false;}
  });
  field('preview').addEventListener('click',()=>showPreview());
  field('apply').addEventListener('click',async()=>{if(!preview)return;field('apply').disabled=true;
    try{await request({action:'save',expected_version:library.version,stocks:preview.stocks});await refresh(true);message('已保存，新配置供下一轮采集使用；新增股票等待首次采集，历史数据保留。');}catch(error){message(error.message);}});
  field('add').addEventListener('click',()=>{
    if(!library)return;
    const rows=field('import').value.trim().split(/\r?\n/).filter(Boolean),newStocks=[];
    try{for(const line of rows){const [code,name]=line.trim().split(/[,，\t ]+/);if(!/^(?:00|30|60)\d{4}$/.test(code)||!name)throw new Error('每行填写“6位代码,名称”，当前支持沪深主板和创业板股票');
      if(draft.some(stock=>stock.code===code)||newStocks.some(stock=>stock.code===code))throw new Error(`${code}已在管理库，请直接修改其采集开关`);
      newStocks.push({code,name,daily:false,quote:false,minute:false,audit:false,priority:1});}
      draft.push(...newStocks);changed();render();field('import').value='';message(`已加入${newStocks.length}只到草稿；默认不采集，请按需打开开关并预览保存。`);
    }catch(error){message(error.message);}
  });
  field('restore').addEventListener('click',async()=>{
    try{const result=await request({action:'restore',version:Number(field('restore-version').value),expected_version:library.version});await refresh(true);message(result.changed?'已恢复名单并生成新版本，下一轮使用；历史未删除。':'所选版本与当前配置相同。');}catch(error){message(error.message);}
  });
  setInterval(()=>{if(!document.hidden&&isVisible()){
    if(!dirty)refresh();
    else request().then(result=>{library.history_preparation=result.history_preparation;renderPreparation();}).catch(()=>{});
  }},15000);
  if(isVisible())refresh();return{refresh};
}
