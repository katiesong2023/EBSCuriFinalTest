const {randomUUID}=require('node:crypto');
function requestEnvelope(input,state){
 const query=input.q??'';
 if(typeof query!=='string')return {error:'검색어는 문자열이어야 합니다.'};
 if(query.length>200)return {error:'검색어는 200자 이내로 입력하세요.'};
 if(!query.trim())return {envelope:null};
 const selected=Object.fromEntries(Object.entries(input).filter(([key])=>!["q","workspace"].includes(key)));
 const locked={...selected,...state,standard:input.standard||'',state:input.state||'',page:String(input.page||1)};
 const envelope={version:'curi-request-input-v1',requestId:randomUUID(),query,
  lockedConditions:Object.entries(locked).map(([name,value])=>Object.freeze({name,value:String(value),owner:'SYSTEM'}))};
 Object.freeze(envelope.lockedConditions);return {envelope:Object.freeze(envelope)};
}
module.exports={requestEnvelope};
