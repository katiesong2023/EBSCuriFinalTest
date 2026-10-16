// 상대 날짜나 날짜 해설을 추정하지 않고 원문에 명시된 연도/ISO 날짜만 연결한다.
function dateBounds(label){
 const year=label.match(/^(\d{4})년?(?:\s*(이후|이전))?$/u);
 if(year){const y=year[1];return {from:year[2]==='이전'?'0000-01-01':y+'-01-01',to:year[2]==='이후'?'9999-12-31':y+'-12-31'};}
 const range=label.match(/^(\d{4}-\d{2}-\d{2})\s*[~∼–]\s*(\d{4}-\d{2}-\d{2})$/u);
 const valid=s=>{const d=new Date(s);return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;};
 if(range&&valid(range[1])&&valid(range[2])&&range[1]<=range[2])return {from:range[1],to:range[2]};
 if(/^\d{4}-\d{2}-\d{2}$/.test(label)&&valid(label))return {from:label,to:label};
 return null;
}
module.exports={dateBounds};
