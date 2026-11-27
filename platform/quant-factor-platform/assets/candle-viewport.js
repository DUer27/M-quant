const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export function candleViewport(rows,key,state=null,preset='all',period='intraday'){
  const total=rows.length,minimum=Math.min(total,period==='intraday'?10:3),same=state?.key===key;
  const requested=same?state.size:['30','60'].includes(String(preset))?Number(preset):null;
  const size=total?requested==null?total:clamp(Math.round(requested),minimum,total):0;
  const anchor=same&&state.endLabel?rows.findIndex(row=>row.label===state.endLabel):-1;
  const end=size===total||anchor<0?total:clamp(anchor+1,size,total),start=Math.max(0,end-size);
  return {key,total,minimum,size,start,end,labels:rows.map(row=>row.label),rows:rows.slice(start,end),following:anchor<0||end===total,
    canZoomIn:size>minimum,canZoomOut:size<total,canEarlier:start>0,canLater:end<total};
}
export function changeCandleViewport(view,action){
  if(!view?.total)return null;
  let size=view.size,end=view.end;
  if(action.type==='reset')return {key:view.key,size:null,endLabel:null};
  if(action.type==='latest')return {key:view.key,size,endLabel:null};
  if(action.type==='zoom'){
    size=clamp(Math.round(view.size*(action.direction==='in'?.5:2)),view.minimum,view.total);
    const index=action.anchor?view.labels.indexOf(action.anchor):-1;
    if(index>=view.start&&index<view.end){const ratio=(index-view.start+.5)/view.size;end=clamp(Math.round(index+.5+(1-ratio)*size),size,view.total);}
    else if(!view.following)end=clamp(view.start+Math.round((view.size+size)/2),size,view.total);
  }else if(action.type==='pan'){
    const step=Math.max(1,Math.round(size*.65));end=clamp(end+(action.direction==='earlier'?-step:step),size,view.total);
  }else return null;
  return {key:view.key,size:size>=view.total?null:size,endLabel:end===view.total?null:view.labels[end-1]};
}
