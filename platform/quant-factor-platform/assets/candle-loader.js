export function createCandleLoader(fetcher=(...args)=>fetch(...args),now=()=>Date.now()){
  const cache=new Map(),pending=new Map(),errors=new Map();
  const key=(code,period,version)=>[code,period,version].join(':');
  async function load(code,period,version){
    if(!code||!['week','month'].includes(period))return;
    const id=key(code,period,version),old=cache.get(id);
    if(old&&now()-old.checked_at<60_000)return old.data;
    if(pending.has(id))return pending.get(id);
    const request=Promise.resolve().then(async()=>{
      try{
        const response=await fetcher('/market-data-api/intraday/candles?'+new URLSearchParams({code,period,pool_version:version}),{signal:AbortSignal.timeout(8000)});
        if(!response.ok)throw new Error('历史K线读取失败');const data=await response.json();
        if(data.code!==code||data.period!==period||data.pool_version!==version||!Array.isArray(data.rows))throw new Error('历史K线版本或股票不匹配');
        if(['invalid','missing'].includes(data.state)&&old?.data){errors.set(id,data.warning||'历史缓存当前不可用');cache.set(id,{...old,checked_at:now()});return old.data;}
        cache.set(id,{data,checked_at:now()});errors.delete(id);
        while(cache.size>20)cache.delete(cache.keys().next().value);
        return data;
      }catch(error){errors.set(id,error.message);cache.set(id,{data:old?.data||null,checked_at:now()});return old?.data;}
      finally{pending.delete(id);while(cache.size>20){const oldest=cache.keys().next().value;cache.delete(oldest);errors.delete(oldest);}}
    });pending.set(id,request);return request;
  }
  function view(code,period,version){const id=key(code,period,version);return {data:cache.get(id)?.data||null,error:errors.get(id)||'',loading:pending.has(id)};}
  return {load,view};
}
