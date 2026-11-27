import { chinaTime, duration } from './market-data.js';
import { renderIntradayCharts } from './intraday-charts.js';
import { renderMonitor } from './intraday-monitor.js';
import { createMinuteLoader } from './intraday-minute-loader.js';
import { renderMinuteAudit } from './intraday-audit.js';
import { renderSymbolDiagnostics } from './intraday-diagnostics.js';
import { renderBackfill } from './intraday-backfill.js';
import { renderIntradayLanes } from './intraday-lanes.js';
import { mountMinuteReadiness } from './intraday-readiness.js';
import { renderServiceHealth } from './service-health.js';
import {createCandleLoader} from './candle-loader.js';
import {changeCandleViewport} from './candle-viewport.js';

export function mountIntradayTrial({ isVisible = () => true, isChartVisible = () => true, isQualityVisible=()=>true } = {}) {
  const panel = document.querySelector('#intraday-trial-panel');
  if (!panel) return;
  const field = (name) => panel.querySelector(`[data-intraday="${name}"]`);
  const minuteReadiness=mountMinuteReadiness(panel,{isVisible:()=>isVisible()&&isQualityVisible()});
  const sourceName = { sina: '新浪', tencent: '腾讯', eastmoney: '东方财富' };
  let currentStatus = null;
  let codeSignature = '';
  let lastNotice = '';
  let seenNotices = false;
  let refreshing = false;
  let connected = false;
  const minuteLoader = createMinuteLoader();
  const candleLoader=createCandleLoader();
  let chartSignature = '';
  function drawCharts() {
    if (!currentStatus || !isChartVisible()) return;
    const attached = minuteLoader.attach(currentStatus, selection.code);
    selection.candleHistory=candleLoader.view(selection.code,selection.candlePeriod,currentStatus.configured_pool_version);
    const signature = JSON.stringify({ code: selection.code, source: selection.source, filter:selection.filter,activityMetric:selection.activityMetric,context: attached.current_context,automatic_enabled:attached.automatic_enabled,
      priceView:selection.priceView,candlePeriod:selection.candlePeriod,candleWindow:selection.candleWindow,candleHistory:selection.candleHistory,candleViewport:selection.candleViewport,
      quotes: attached.quotes?.map(({ age_seconds, received_at, ...quote }) => quote),
      minutes: attached.minutes?.map((entry) => ({ code: entry.code, version: entry.data?.version,
        loaded: !!entry.data?.rows, cached: entry.cached, current_ok: entry.current_ok, fresh: entry.fresh, error: entry.error })),
      history: attached.scheduler?.history, lanes:attached.lanes&&Object.fromEntries(Object.entries(attached.lanes).map(([kind,lane])=>[kind,{history:lane.history,target:lane.target_seconds}])),rounds: attached.rounds });
    if (signature === chartSignature) return;
    chartSignature = signature;
    renderIntradayCharts(panel, attached, selection);
  }
  async function loadSelectedMinute() {
    if (!isChartVisible()) return;
    if(selection.candlePeriod!=='intraday'){
      const code=selection.code,period=selection.candlePeriod,version=currentStatus?.configured_pool_version;
      const work=candleLoader.load(code,period,version);drawCharts();await work;
      if(selection.code===code&&selection.candlePeriod===period)drawCharts();return;
    }
    const code = selection.code, entry = currentStatus?.minutes?.find((m) => m.code === code);
    if (!entry?.data?.version) return;
    await minuteLoader.load(code, entry.data.version);
    if (selection.code === code) {
      drawCharts();
      field('chart-error').textContent = minuteLoader.error(code);
    }
  }
  const selection = { code: '', source: 'sina.quote', filter:'',activityMetric:'volume',priceView:'candles',candlePeriod:'intraday',candleWindow:'all',candleFocus:null,candleViewport:null,
    onViewport(action){selection.candleViewport=changeCandleViewport(selection.candleViewportModel,action);if(action.type==='reset'){selection.candleWindow='all';selection.candleViewport=null;}
      selection.candleFocus=null;drawCharts();},onSelect(code) {
    selection.candleViewport=null;
    selection.candleFocus=null;
    selection.code = code; field('stock').value = code;
    field('chart-error').textContent = '';
    drawCharts(); loadSelectedMinute();
  } };
  field('stock').addEventListener('change', () => selection.onSelect(field('stock').value));
  field('quote-source').addEventListener('change', () => {
    selection.source = field('quote-source').value;
    drawCharts();
  });
  field('chart-filter').addEventListener('input',()=>{selection.filter=field('chart-filter').value;drawCharts();});
  field('activity-metric').addEventListener('change',()=>{selection.activityMetric=field('activity-metric').value;drawCharts();});
  function syncCandleControls(){field('price-view').value=selection.priceView;field('candle-period').value=selection.candlePeriod;
    field('candle-window').disabled=selection.priceView!=='candles'||selection.candlePeriod!=='intraday';selection.candleFocus=null;selection.candleViewport=null;drawCharts();loadSelectedMinute();}
  field('price-view').addEventListener('change',()=>{selection.priceView=field('price-view').value;if(selection.priceView==='line')selection.candlePeriod='intraday';syncCandleControls();});
  field('candle-period').addEventListener('change',()=>{selection.candlePeriod=field('candle-period').value;if(selection.candlePeriod!=='intraday')selection.priceView='candles';syncCandleControls();});
  field('candle-window').addEventListener('change',()=>{selection.candleWindow=field('candle-window').value;selection.candleFocus=null;selection.candleViewport=null;drawCharts();});
  for(const [name,action]of [['candle-zoom-in',{type:'zoom',direction:'in'}],['candle-zoom-out',{type:'zoom',direction:'out'}],['candle-earlier',{type:'pan',direction:'earlier'}],['candle-later',{type:'pan',direction:'later'}],['candle-latest',{type:'latest'}],['candle-reset',{type:'reset'}]])field(name).addEventListener('click',()=>selection.onViewport(action));
  field('backfill-filter').addEventListener('change',()=>{if(currentStatus)renderBackfill(panel,currentStatus);});
  const format = (number) => Number.isFinite(number) ? number.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : '缺失';
  function row(parent, cells, header = false) {
    const tr = document.createElement('tr');
    for (const text of cells) {
      const td = document.createElement(header ? 'th' : 'td'); td.textContent = String(text); tr.append(td);
    }
    parent.append(tr);
  }
  function line(parent, text) { const p = document.createElement('p'); p.textContent = text; parent.append(p); }
  const percent = (value) => Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '暂无样本';
  function validationSummary(report) {
    if (!report) return;
    field('validation-state').textContent = report.ready_for_review ? '达到基础阈值，待复核' : '继续积累盘中记录';
    field('validation-summary').textContent = `${report.day} · 自动盘中 ${report.automatic_runs}轮 · 观察${report.observed_trading_minutes}分钟 · 完整且新鲜 ${percent(report.complete_rate)} · 一分钟目标达成 ${percent(report.timely_rate)} · 窗口缺轮 ${report.missed_slots}轮`;
    field('validation-timing').textContent = `采集耗时中位数 ${duration(report.elapsed_p50_seconds)} / P95 ${duration(report.elapsed_p95_seconds)} / 最慢 ${duration(report.elapsed_max_seconds)}；每轮最旧报价源时间差P95 ${duration(report.max_quote_age_p95_seconds)}，分钟源时间差P95 ${duration(report.max_minute_age_p95_seconds)}。`;
    const reasons = field('validation-reasons'); reasons.replaceChildren();
    for (const reason of report.reasons || []) line(reasons, reason);
    for (const [source, count] of Object.entries(report.fallback_or_failure_counts || {})) line(reasons, `${source}：${count}次失败、冷却或切源`);
    line(reasons, `已排除休市/手动${report.excluded_observation_or_manual}轮、其他股票池${report.excluded_other_pools}轮。${report.interpretation}`);
  }
  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    try {
      const response = await fetch('/market-data-api/intraday/summary',{signal:AbortSignal.timeout(8000)});
      if (!response.ok) throw new Error('暂时无法读取接入试验');
      const status = await response.json();
      currentStatus = status;
      field('pool-label').textContent=`自动采集监控 · 报价${status.codes?.length||0}只 / 分钟${status.minute_codes?.length??status.codes?.length??0}只`;
      field('pool-version').textContent=`管理库配置v${status.configured_pool_version||'未启用'} · 最近/当前轮v${status.running_pool_version||'旧配置'}${status.pool_pending?'；名单已更新，当前轮保留原配置，新配置下一轮使用。':''}`;
      connected = true;
      renderServiceHealth(panel,status.service_health,true);
      field('monitor-connection').textContent = '';
      renderMonitor(panel, status, new Date(), true);
      renderIntradayLanes(panel,status,new Date(),true);
      validationSummary(status.validation_session?.summary || status.validation);
      field('validation-window').textContent = status.validation_session
        ? `本次窗口开始于${chinaTime(status.validation_session.started_at)}；按本次股票池和来源顺序单独验收，全天历史失败继续保留。全天自动完成${status.validation?.automatic_runs || 0}轮。${status.validation_session.configuration_changed ? '配置已变化，需要重建窗口。' : ''}`
        : '当前展示全天记录；开始新窗口后单独统计修复后的连续运行，历史记录不会删除。';
      field('validation-download').setAttribute('href', '/market-data-api/intraday/validation?download=1' + (status.validation_session ? '&session=1' : ''));
      field('begin-validation').disabled = !!status.split_collection || !status.automatic_enabled || status.current_context !== 'trading';
      if(status.split_collection)field('validation-window').textContent=status.validation_note+' 原窗口和结果继续保留。';
      renderMinuteAudit(panel, status);
      minuteReadiness.render(status);
      renderSymbolDiagnostics(panel, status, field('diagnostics-filter').value === 'all');
      renderBackfill(panel, status);
      const signature = (status.codes || []).join(',');
      if (signature !== codeSignature) {
        codeSignature = signature;
        const stock = field('stock'); stock.replaceChildren();
        for (const code of status.codes || []) {
          const option = document.createElement('option'); option.value = code;
          option.textContent = `${code} ${status.quotes?.find((q) => q.code === code)?.name || ''}`; stock.append(option);
        }
        if (!status.codes?.includes(selection.code)) selection.code = status.codes?.[0] || '';
        stock.value = selection.code;
      }
      drawCharts(); loadSelectedMinute();
      const storage = status.storage;
      field('storage').textContent = !storage || storage.state === 'not_initialized' ? '独立存储尚未初始化，现有缓存继续使用。'
        : storage.state === 'degraded' ? `独立存储核对需检查：${(storage.errors || []).join('、')}。采集与缓存继续，分钟数据仍为待验证样本。`
        : `独立存储并行核对：${storage.matched_series ?? storage.matched_cached_series ?? 0}只序列一致；已保存${storage.minute_candidates || 0}条分钟样本，正式闭合K线${storage.verified_minute_bars || 0}条。`;
      const labels = { running: '接入测试中', sample_available: '已获取样本', failed: '本轮未完成', interrupted: '上次试验中断', not_started: '尚未试验' };
      field('state').textContent = labels[status.state] || status.state;
      if (status.state === 'sample_available' && status.coverage && status.coverage.minutes < (status.minute_codes||status.codes).length) {
        field('state').textContent = '报价已返回 · 分钟未完整';
      }
      const checks = status.latest_checks || [];
      const kinds = { validation: '字段或时效检查未通过', network: '连接失败', rate_limit: '限流/访问限制', local: '本地写入失败', cooldown: '冷却跳过', circuit_skip: '连接故障跳过' };
      field('source-health').textContent = ['sina', 'eastmoney'].map((source) => {
        const items = checks.filter((check) => check.source === source && check.kind === 'minute');
        const requested = items.filter((check) => check.request_sent === true || check.http_status).length;
        const returned = items.filter((check) => check.http_status != null).length;
        const valid = new Set(items.filter((check) => check.ok && check.selected !== false).map(check => check.code)).size;
        const skipped = items.filter((check) => check.request_sent === false).length;
        const pending = (status.minutes || []).filter((entry) => entry.current_ok && entry.data?.source === source + '.minute').reduce((sum, entry) => sum + (entry.data?.pending_count || 0), 0);
        const failures = [...new Set(items.filter((check) => !check.ok).map((check) => kinds[check.failure_kind] || check.reason || check.error))];
        const blocked = status.source_health?.[source + '.minute']?.blocked_until;
        return `${sourceName[source]}分钟：请求${requested}次 / 网络返回${returned}次 / 有效样本${valid}只 / 跳过${skipped}只；隔离尾部候选${pending}条${items.length ? '' : '；本轮未请求该来源'}${failures.length ? '；' + failures.join('、') : ''}${blocked > Date.now() / 1000 ? '；冷却至' + chinaTime(blocked * 1000) : ''}`;
      }).join('。');
      field('probe').disabled = status.state === 'running';
      field('probe-quote').disabled=!status.split_collection||status.lanes?.quote?.state==='running';
      field('probe-minute').disabled=!status.split_collection||status.lanes?.minute?.state==='running'||!(status.minute_codes||[]).length;
      const contexts = { trading: '交易时段', market_closed: '休市时段', non_trading_day: '非交易日', calendar_unknown: '交易日历待确认' };
      const quoted = status.current_quote_stocks ?? new Set((status.quotes || []).filter((q) => !q.cached).map((q) => q.code)).size;
      const minuteCount = (status.minutes || []).filter((entry) => entry.current_ok).length;
      field('summary').textContent = `${contexts[status.current_context]} · 报价 ${quoted}/${status.codes?.length || 0}只 · 本轮分钟 ${minuteCount}/${(status.minute_codes||status.codes||[]).length}只 · 报价批量返回 ${duration(status.metrics?.quote_batch_seconds)} · 最近完成 ${chinaTime(status.finished_at)} · 总耗时 ${duration(status.elapsed_seconds)}。`;
      if(status.split_collection)field('summary').textContent=`${contexts[status.current_context]} · 报价已获取${quoted}/${status.codes?.length||0}只 · 分钟已获取${minuteCount}/${status.minute_codes?.length||0}只。两类数据来自各自运行记录，更新时间见上方卡片。`;
      field('freshness').textContent = status.current_context === 'trading'
        ? `90秒内源时间覆盖 ${status.fresh_stocks}/${status.codes?.length || 0}只；${status.fresh ? '样本时间检查通过，持续性仍待验证' : '当前样本尚不能视为及时行情'}。`
        : '以下为接口返回的最近样本；休市期间不判定为盘中实时达标，返回速度不代表行情延迟。';
      field('notice').textContent = status.warning || status.error || (status.automatic_enabled
        ? `交易时段目标每60秒更新；当前间隔${status.scheduler?.interval_seconds || 60}秒。平台服务需保持运行，网页可关闭。`
        : '自动更新已暂停，仍可手动采集；未接账户或自动下单。');
      if(status.split_collection&&status.automatic_enabled&&!status.error&&!status.warning)field('notice').textContent=`交易时段报价目标${status.lanes.quote.target_seconds}秒、分钟目标${status.lanes.minute.target_seconds}秒更新；超时各自退避。目标频率不等于来源时间按同频率推进。`;
      const automatic = field('automatic');
      automatic.textContent = status.automatic_enabled ? '暂停自动更新' : '启用自动更新';
      automatic.disabled = false;
      field('schedule').textContent = `当前${status.automatic_enabled ? '已启用' : '已暂停'} · ${status.scheduler?.waiting_for_session ? '等待交易时段（午休及非交易日暂停）' : status.state === 'running' ? '本轮执行中' : `下一轮 ${chinaTime(status.scheduler?.next_start_at)}`} · 恢复要求：连续两轮完整新数据在60秒内完成。`;
      if(status.split_collection)field('schedule').textContent='报价与分钟分别调度；各类型连续两轮完整、来源时间推进且在自身目标内完成，才恢复该类型的目标间隔。平台服务需保持运行，网页可关闭。';
      const notice = status.scheduler?.notices?.at(-1);
      if (notice && notice.id !== lastNotice) {
        if (seenNotices) {
          const toast = field('toast'); toast.textContent = notice.message; toast.hidden = false;
        }
        lastNotice = notice.id;
      }
      seenNotices = true;
      const events = field('events'); events.replaceChildren();
      for (const item of [...(status.scheduler?.notices || [])].reverse()) line(events, `${chinaTime(item.at)} · ${item.message}`);
      const history = field('history'); history.replaceChildren();
      const histories=status.split_collection?Object.entries(status.lanes||{}).flatMap(([lane,value])=>(value.history||[]).map(r=>({...r,lane}))).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)):[...(status.scheduler?.history||[])].reverse();
      for (const item of histories.slice(0,20)) {
        line(history, `${chinaTime(item.at)} · ${duration(item.elapsed_seconds)} · ${status.split_collection?(item.lane==='quote'?'报价':'分钟')+'覆盖'+item.coverage+'只':`报价${item.quotes}只/分钟${item.minutes}只`} · ${item.observation_only ? '休市采样，不计入盘中验收' : item.complete ? item.advanced ? '新鲜且源时间推进' : '数据重复，未计入恢复' : '未通过完整时效检查'} · 后续间隔${item.interval_seconds}秒`);
      }
      const results = field('results'); results.replaceChildren();
      for (const round of status.rounds || []) {
        for (const check of round.checks || []) line(results,
          `${chinaTime(check.received_at || check.started_at)} · ${sourceName[check.source] || check.source} ${check.code || ''} · ${check.kind === 'quote' ? '报价/五档盘口' : '分钟接口'} · ${check.ok ? `字段检查通过${check.validation_failures?.length ? `，${check.validation_failures.length}只缺失` : ''}` : `${kinds[check.failure_kind] || '失败'}：${check.error || '未返回有效数据'}${check.reason ? `（${check.reason}）` : ''}`} · 请求与解析 ${duration(check.seconds)}`);
      }
      const quotes = field('quotes'); quotes.replaceChildren();
      row(quotes, ['股票/来源', '最新价', '买一/卖一', '买一量/卖一量（股）', '累计成交量（股）', '累计成交额（元）', '源时间（北京时间）', '交易状态'], true);
      for (const q of status.quotes || []) row(quotes, [
        `${q.code} ${q.name} / ${sourceName[q.source.split('.')[0]] || q.source}`,
        format(q.last), `${format(q.bids[0].price)} / ${format(q.asks[0].price)}`,
        `${format(q.bids[0].shares)} / ${format(q.asks[0].shares)}`,
        format(q.volume_shares), format(q.amount_yuan), `${chinaTime(q.source_time)}${q.cached ? ' · 上次成功' : ''}`,
        '未知（来源未可靠提供）',
      ]);
      field('timestamp-note').textContent = status.timestamp_note || '源时间语义与盘中延迟待验证。';
      const minutes = field('minutes'); minutes.replaceChildren();
      let minuteShown = false;
      for (const entry of status.minutes || []) {
        if (!entry.data) { line(minutes, `${entry.code}：分钟缺失 · ${entry.error || '本轮尚未获取'}`); continue; }
        minuteShown = true;
        line(minutes, `${entry.code} · ${sourceName[entry.data.source.split('.')[0]] || entry.data.source}：${entry.data.count}条，截至${chinaTime(entry.data.source_time)} · ${entry.cached ? '本轮未完成，保留上次成功样本' : '本轮获取'}。`);
        for (const failure of entry.source_failures || []) line(minutes, `${sourceName[failure.source] || failure.source}：${failure.error}`);
      }
      if (!minuteShown) line(minutes, '分钟接口本轮尚无通过字段检查的样本；报价成功不代表分钟接口也成功。');
    } catch (error) {
      if(connected){const toast=field('toast');toast.textContent='平台连接中断，无法确认采集是否运行；恢复后查看后台守护事件。';toast.hidden=false;}
      connected = false;
      renderServiceHealth(panel,currentStatus?.service_health,false);
      if (currentStatus) renderMonitor(panel, currentStatus, new Date(), false);
      if(currentStatus)renderIntradayLanes(panel,currentStatus,new Date(),false);
      else {
        field('monitor-connection').textContent = '监控连接中断，无法确认自动采集是否运行。';
        renderMonitor(panel, {}, new Date(), false);
      }
      field('state').textContent = '连接中断'; field('notice').textContent = ['TimeoutError','AbortError'].includes(error.name)?'平台状态读取超过8秒，已结束本次等待，稍后自动重试。':error.message;
    } finally { refreshing = false; }
  }
  field('dismiss-toast').addEventListener('click', () => { field('toast').hidden = true; });
  async function backfillAction(body) {
    try {
      const response = await fetch('/market-data-api/intraday/backfill', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error('补采操作未完成');
      const result = await response.json();
      await refresh();
      if (result.accepted === false) field('backfill-note').textContent = result.reason;
    } catch (error) { field('backfill-note').textContent = error.message; }
  }
  field('backfill-run').addEventListener('click', () => backfillAction({ action: 'run-one' }));
  field('backfill-toggle').addEventListener('click', () => backfillAction({ enabled: !currentStatus?.backfill?.enabled }));
  field('diagnostics-filter').addEventListener('change', () => {
    if (currentStatus) renderSymbolDiagnostics(panel, currentStatus, field('diagnostics-filter').value === 'all');
  });
  field('begin-validation').addEventListener('click', async () => {
    try {
      const response = await fetch('/market-data-api/intraday/validation-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!response.ok) throw new Error('开始验收失败');
      const result = await response.json();
      if (!result.accepted) throw new Error(result.reason);
      await refresh();
    } catch (error) { field('notice').textContent = error.message; }
  });
  field('automatic').addEventListener('click', async () => {
    const button = field('automatic'); button.disabled = true;
    try {
      const response = await fetch('/market-data-api/intraday/automatic', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !currentStatus?.automatic_enabled }) });
      if (!response.ok) throw new Error('修改自动更新失败');
      await refresh();
    } catch (e) { field('notice').textContent = e.message; }
    finally { button.disabled = false; }
  });
  field('probe').addEventListener('click', async () => {
    field('probe').disabled = true;
    try {
      const response = await fetch('/market-data-api/intraday/probe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!response.ok) throw new Error('试验启动失败');
      const result = await response.json();
      await refresh();
      if (!result.accepted) field('notice').textContent = result.reason;
    } catch (error) { field('notice').textContent = error.message; field('probe').disabled = false; }
  });
  for(const kind of ['quote','minute'])field('probe-'+kind).addEventListener('click',async()=>{
    field('probe-'+kind).disabled=true;
    try{const response=await fetch('/market-data-api/intraday/probe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lane:kind})});
      if(!response.ok)throw new Error('独立采集启动失败');const result=await response.json();await refresh();if(!result.accepted)field('notice').textContent=result.reason;
    }catch(error){field('notice').textContent=error.message;field('probe-'+kind).disabled=false;}
  });
  if (isVisible()) refresh();
  setInterval(() => { if (currentStatus && !document.hidden && isVisible()){renderMonitor(panel,currentStatus,new Date(),connected);renderIntradayLanes(panel,currentStatus,new Date(),connected);} }, 1000);
  setInterval(() => { if (!document.hidden && isVisible()) refresh(); }, 5000);
  return { refresh };
}
