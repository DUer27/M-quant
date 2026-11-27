import {readFileSync} from 'node:fs';
import {join} from 'node:path';

export const verificationSources=Object.freeze([
  {id:'sse-2026',title:'上交所交易规则（2026年修订）',url:'https://www.sse.com.cn/lawandrules/sselawsrules2025/stocks/exchange/c/c_20260424_10816482.shtml',
    supports:'竞价交易时段与14:57—15:00收盘集合竞价边界',does_not_establish:'第三方分钟标签含义、出数延迟或闭合承诺'},
  {id:'szse-2026',title:'深交所交易规则（2026年修订）第2.3.2条',url:'https://docs.static.szse.cn/www/lawrules/rule/trade/current/W020260424690713155663.pdf',
    supports:'竞价交易时段与14:57—15:00收盘集合竞价边界',does_not_establish:'第三方分钟标签含义、出数延迟或闭合承诺'},
  {id:'akshare-sina-adapter',title:'AKShare维护者的新浪分钟适配代码',url:'https://github.com/akfamily/akshare/blob/main/akshare/stock/quote/stock_zh_a_sina.py',
    supports:'使用同一新浪getKLineData接口，period与不复权返回路径',does_not_establish:'新浪供应商对标签起止含义和已闭合周期的正式保证'},
]);
export function createMinuteSourceVerification({projectRoot,now=()=>new Date()}){
  const runtime=join(projectRoot,'outputs/live-market-data/intraday-trial');
  function load(status){
    const day=now().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'}),selected=(status.minute_audit?.codes||[]).filter(c=>(status.minute_codes||[]).includes(c)).slice(0,3);
    let saved={},readError='';
    try{saved=JSON.parse(readFileSync(join(runtime,'minute-boundary-observations',day+'.json'),'utf8'));}
    catch(error){if(error.code!=='ENOENT')readError='观测档案读取异常，不能据此认定证据充分';}
    const stocks=selected.map(code=>{
      const stock=(saved.stocks||[]).find(s=>s.code===code);
      return stock&&stock.day===day?stock:{code,day,deliveries:0,intraday_deliveries:0,phase_counts:{},recent:[]};
    });
    return {day,selected,stocks,readError};
  }
  function summary(status){
    const {day,selected,stocks,readError}=load(status);
    const intraday=stocks.reduce((n,s)=>n+(s.intraday_deliveries||0),0);
    return {schema:'minute-source-verification.v1',reviewed_on:'2026-11-25',day,sample_codes:selected,
      exchange_session_rule:'reference_checked',label_semantics:'unverified',closure_rule:'unverified',strategy_eligible:false,
      automatic_enabled:!!status.automatic_enabled,recorder_mode:'passive_existing_collection',read_error:readError,
      intraday_deliveries:intraday,deliveries:stocks.reduce((n,s)=>n+(s.deliveries||0),0),
      evidence_state:readError?'archive_error':intraday?'observations_in_progress':'awaiting_intraday_observations',
      references:verificationSources,
      stocks:stocks.map(stock=>({...stock,recent:(stock.recent||[]).slice(0,5).map(({id,code,source,received_at,recorded_at,origin,receipt_phase,intraday_evidence,last_label,receipt_minus_last_label_seconds,observed_boundary_labels,labels})=>
        ({id,code,source,received_at,recorded_at,origin,receipt_phase,intraday_evidence,last_label,receipt_minus_last_label_seconds,observed_boundary_labels,stored_labels:labels?.length||0}))})),
      remaining_evidence:['分钟标签代表周期开始还是结束','形成过程中OHLC及成交量如何修订','开盘、午间、14:57及15:00边界如何出数','闭合后修订与断线恢复的处理规则'],
      note:'记录器只复用原采集的3只核查样本，不额外请求行情；交易时段观测次数增加也不自动开放策略。'};
  }
  function detail(code,status){const {day,selected,stocks}=load(status);if(!selected.includes(code)||!/^\d{6}$/.test(code))return null;
    const stock=stocks.find(s=>s.code===code);return {schema:'minute-boundary-detail.v1',day,code,strategy_eligible:false,closure_verified:false,
      ...stock,recent:(stock.recent||[]).slice(0,6),note:'仅保留最近8个标签、已见关键边界和有限修订样本；不是完整行情档案。'};
  }
  return {summary,detail};
}
