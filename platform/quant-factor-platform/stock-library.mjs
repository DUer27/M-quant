import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';

export const seedStocks = [
  ['600519','贵州茅台'], ['600036','招商银行'], ['601318','中国平安'], ['600276','恒瑞医药'], ['600887','伊利股份'],
  ['601398','工商银行'], ['600900','长江电力'], ['601888','中国中免'], ['601012','隆基绿能'], ['600030','中信证券'],
];
export const libraryPath = root => join(root, 'platform/quant-factor-platform/config/stock-library.json');
export const dailyPoolHash = config => config.managed_symbols ? createHash('sha256').update(config.managed_symbols.map(s=>s.code).sort().join('\n')).digest('hex') : null;
export function readLibrary(root) {
  const path=libraryPath(root);
  return existsSync(path) ? JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,'')) : null;
}
export function validateStocks(stocks) {
  if (!Array.isArray(stocks) || !stocks.length || stocks.length>500) throw new Error('管理库限定1—500只股票');
  const seen=new Set();
  const result=stocks.map(stock=>{
    const code=String(stock.code || '').trim(),name=String(stock.name || '').trim();
    if (!/^(?:00|30|60)\d{4}$/.test(code)) throw new Error(`暂不支持该证券代码：${code}`);
    if (seen.has(code)) throw new Error(`代码重复：${code}`);seen.add(code);
    if (!name || name.length>30 || /[\r\n\x00-\x1f]/.test(name)) throw new Error(`${code}股票名称无效`);
    for (const key of ['daily','quote','minute','audit']) if(typeof stock[key]!=='boolean')throw new Error(`${code}的${key}应为开关`);
    if(stock.minute&&!stock.quote)throw new Error(`${code}分钟采集需要同时启用报价`);
    if(stock.audit&&!stock.minute)throw new Error(`${code}分钟核查需要启用分钟采集`);
    const priority=Number(stock.priority ?? 1);if(![0,1,2].includes(priority))throw new Error('优先级应为0、1或2');
    return {code,name,daily:stock.daily,quote:stock.quote,minute:stock.minute,audit:stock.audit,priority};
  });
  if(!result.some(s=>s.daily))throw new Error('日线池至少保留1只');
  const live=result.filter(s=>s.quote).length;if(live<1||live>50)throw new Error('盘中报价池限定1—50只；请先停采其他股票再加入');
  if(result.filter(s=>s.audit).length>3)throw new Error('分钟核查样本最多3只');
  return result;
}
export function effectiveConfig(base, library, kind) {
  if(!library)return base;
  const stocks=validateStocks(library.stocks),ordered=[...stocks].sort((a,b)=>a.priority-b.priority||a.code.localeCompare(b.code));
  const metadata={pool_version:library.version,pool_id:library.id};
  if(kind==='daily')return {...base,...metadata,label:`日线股票池 · ${stocks.filter(s=>s.daily).length}只`,
    managed_symbols:ordered.filter(s=>s.daily).map(({code,name})=>({code,name})),priority_codes:ordered.filter(s=>s.daily&&s.priority===0).map(s=>s.code)};
  return {...base,...metadata,codes:ordered.filter(s=>s.quote).map(s=>s.code),minute_codes:ordered.filter(s=>s.minute).map(s=>s.code),
    minute_audit_codes:ordered.filter(s=>s.audit).map(s=>s.code),label:`盘中股票池 · ${stocks.filter(s=>s.quote).length}只`};
}
export function snapshotConfig(root, config, kind) {
  const directory=join(root,'outputs/live-market-data/pool-config-snapshots');mkdirSync(directory,{recursive:true});
  const content=JSON.stringify({...config,pool_snapshot:true},null,2),hash=createHash('sha256').update(content).digest('hex').slice(0,20);
  const path=join(directory,`${kind}-${config.pool_version || 'legacy'}-${hash}.json`);
  if(!existsSync(path))writeFileSync(path,content,'utf8');return path;
}
const atomic=(path,value)=>{const temp=path+'.'+randomUUID()+'.tmp';writeFileSync(temp,JSON.stringify(value,null,2)+'\n','utf8');renameSync(temp,path);};
export function createStockLibrary({projectRoot,platformRoot,now=()=>new Date()}) {
  const path=libraryPath(projectRoot),history=join(projectRoot,'outputs/live-market-data/stock-library-history');
  const read=()=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));
  function initialize() {
    if(existsSync(path)){
      const current=read();validateStocks(current.stocks);mkdirSync(history,{recursive:true});
      if(!existsSync(join(history,current.version+'.json')))atomic(join(history,current.version+'.json'),current);
      return current;
    }
    const intraday=JSON.parse(readFileSync(join(platformRoot,'config/intraday-trial.json'),'utf8').replace(/^\uFEFF/,''));
    const daily=JSON.parse(readFileSync(join(platformRoot,'config/market-data.json'),'utf8').replace(/^\uFEFF/,''));
    const csv=readFileSync(resolve(projectRoot,daily.symbols_file),'utf8').replace(/^\uFEFF/,'').trim().split(/\r?\n/).slice(1);
    const stocks=csv.map(line=>{const [code,name]=line.split(',');return {code,name,daily:true,quote:intraday.codes.includes(code),
      minute:(intraday.minute_codes||intraday.codes).includes(code),audit:(intraday.minute_audit_codes||[]).includes(code),priority:1};});
    for(const code of intraday.codes)if(!stocks.some(s=>s.code===code))stocks.push({code,name:code,daily:false,quote:true,minute:true,audit:false,priority:1});
    for(const [code,name]of seedStocks)if(!stocks.some(s=>s.code===code))stocks.push({code,name,daily:false,quote:false,minute:false,audit:false,priority:1});
    const value={schema:'stock-library.v1',id:randomUUID(),version:1,updated_at:now().toISOString(),reason:'导入原股票池并加入常见可选股票',stocks:validateStocks(stocks)};
    mkdirSync(history,{recursive:true});atomic(join(history,'1.json'),value);atomic(path,value);return value;
  }
  function preview(stocks,expectedVersion) {
    const current=read();if(expectedVersion!==current.version)throw new Error('股票池已被其他操作更新，请刷新后再保存');
    const next=validateStocks(stocks),old=new Map(current.stocks.map(s=>[s.code,s]));
    const changes=next.flatMap(stock=>{const before=old.get(stock.code);const fields=['name','daily','quote','minute','audit','priority'].filter(k=>before?.[k]!==stock[k]);return fields.length?[{code:stock.code,name:stock.name,fields,before:before||null,after:stock}]:[];});
    for(const stock of current.stocks)if(!next.some(s=>s.code===stock.code))changes.push({code:stock.code,name:stock.name,fields:['removed_from_library'],before:stock,after:null});
    return {expected_version:current.version,next_version:current.version+1,changes,counts:{library:next.length,daily:next.filter(s=>s.daily).length,quote:next.filter(s=>s.quote).length,minute:next.filter(s=>s.minute).length,audit:next.filter(s=>s.audit).length},
      signature:createHash('sha256').update(JSON.stringify(next)).digest('hex'),stocks:next};
  }
  function save(stocks,expectedVersion,reason='用户修改采集股票池') {
    const check=preview(stocks,expectedVersion);if(!check.changes.length)return {changed:false,library:read()};
    const current=read(),value={...current,version:current.version+1,updated_at:now().toISOString(),reason:String(reason).slice(0,160),stocks:check.stocks};
    mkdirSync(history,{recursive:true});atomic(join(history,`${value.version}.json`),value);atomic(path,value);
    return {changed:true,library:value,changes:check.changes};
  }
  function restore(version,expectedVersion) {
    if(!Number.isInteger(version)||version<1)throw new Error('版本号无效');
    const target=JSON.parse(readFileSync(join(history,version+'.json'),'utf8'));return save(target.stocks,expectedVersion,`恢复版本${version}的名单，保留历史数据`);
  }
  function status() {
    const library=read(),runtime=join(projectRoot,'outputs/live-market-data');
    const optional=path=>{try{return JSON.parse(readFileSync(path,'utf8'));}catch{return null;}};
    const full=optional(join(runtime,'intraday-trial/status-light.json'));
    return {...library,versions:readdirSync(history).filter(name=>/^\d+\.json$/.test(name)).map(name=>Number(name.split('.')[0])).sort((a,b)=>b-a).slice(0,20),stocks:library.stocks.map(stock=>{
      const quote=optional(join(runtime,`intraday-trial/quote-lane/quote-cache/sina-${stock.code}.json`))||optional(join(runtime,`intraday-trial/quote-cache/sina-${stock.code}.json`));
      const minute=optional(join(runtime,`intraday-trial/minute-cache/${stock.code}.meta.json`));
      return {...stock,availability:{daily_cache:existsSync(join(runtime,'cache',stock.code+'.csv')),quote_time:quote?.data?.source_time||null,
        minute_time:minute?.data?.source_time||null,minute_source:minute?.data?.source||null}};
    }),last_intraday_version:full?.pool_version||null,note:'保存后下一轮使用新配置；移出仅停止请求，历史缓存和运行记录保留。'};
  }
  return {initialize,status,preview,save,restore};
}
