import { chinaTime } from './market-data.js';

export function renderMinuteAudit(panel, status) {
  const field = (name) => panel.querySelector(`[data-intraday="${name}"]`);
  const audit = status.minute_audit || {}, samples = audit.samples || [];
  const observed = samples.filter((sample) => sample.row_count > 0);
  const current = observed.filter((sample) => sample.current_run && sample.matches_displayed_series);
  field('audit-state').textContent = audit.errors?.length ? '核查异常 · 闭合待核实' : '闭合规则待核实';
  field('audit-summary').textContent = `小样本${audit.codes?.length || 0}只 · 本轮核查${current.length}只 · 已有记录${observed.length}只。正式闭合K线不会因时间经过而自动确认；分钟样本尚不供正式策略使用。`;
  const details = field('audit-details'); details.replaceChildren();
  const sourceName = { 'sina.minute': '新浪', 'eastmoney.minute': '东方财富' };
  for (const sample of samples) {
    const line = document.createElement('p');
    if (!sample.row_count) {
      line.textContent = `${sample.code}：等待首次有效分钟样本，尚不能判断缺口或闭合状态。`;
    } else {
      const comparison = sample.comparison_state === 'first_observation' ? '首次观测，修订尚无前次可比'
        : sample.comparison_state === 'new_day' ? '新交易日，未跨日比较修订'
        : sample.comparison_state === 'source_or_basis_changed' ? '来源或口径改变，未混合比较'
        : sample.comparison_state === 'older_receipt_ignored' ? '接收顺序倒退，未更新核查基线'
        : `与前次同源比较${sample.compared_labels}条，变化${sample.changed_labels}条`;
      const flags = [sample.latest_label_regressed ? '最新标签倒退，保留较新基线' : '',
        sample.pending_count ? `已隔离${sample.pending_count}条下一分钟边界候选，未计入样本覆盖` : '',
        sample.source_switched_from ? `从${sourceName[sample.source_switched_from] || sample.source_switched_from}切换，未跨来源比较修订` : '',
        sample.input_reordered ? '来源乱序，已排序' : '', sample.disappeared_in_overlap ? `重叠范围少了${sample.disappeared_in_overlap}个标签` : ''].filter(Boolean);
      line.textContent = `${sample.code} · ${sourceName[sample.source] || sample.source} · ${sample.current_run && sample.matches_displayed_series ? '本轮核查' : '上次核查，非本轮结果'} · ${sample.day}截至${chinaTime(sample.last_label)} · ${sample.row_count}条 · 当前同源连续观测${sample.observation_count}次；${comparison}；内部疑似缺${sample.possible_missing_labels}个标签；与接收同分钟标签${sample.possible_forming_count}条（可能形成中，未确认）；闭合未核实。${flags.join('；')}${flags.length ? '。' : ''}`;
    }
    details.append(line);
    if (sample.observed_boundary_labels?.length) {
      const detail = document.createElement('p'); detail.className = 'library-source';
      detail.textContent = `已见边界标签：${sample.observed_boundary_labels.map(chinaTime).join('、')}；开收盘及午间边界口径待核实，不能直接当作普通闭合分钟。`;
      details.append(detail);
    }
    for (const gap of sample.gap_examples || []) {
      const detail = document.createElement('p'); detail.className = 'library-source';
      detail.textContent = `疑似缺口：${chinaTime(gap.after)}至${chinaTime(gap.before)}之间${gap.candidate_labels}个标签；待核实来源口径与交易状态，不补零。`;
      details.append(detail);
    }
    for (const change of sample.change_examples || []) {
      const detail = document.createElement('p'); detail.className = 'library-source';
      detail.textContent = `同源修订：${chinaTime(change.label)}，字段${change.fields.join('、')}发生变化；旧值已保留供核查。`;
      details.append(detail);
    }
  }
  for (const error of audit.errors || []) {
    const line = document.createElement('p'); line.textContent = `${error.code}核查异常：${error.error}；行情缓存继续保留。`;
    details.append(line);
  }
  const note = document.createElement('p'); note.className = 'library-source';
  note.textContent = '核查复用已抓取数据，不新增行情请求。缺口仅检查同一时段已见标签之间；午休、开收盘口径和整段未返回需另行核实。重复标签整段拒收，乱序排序后记录；跨来源不作修订比较。';
  details.append(note);
}
