const {DiscoveryInputError}=require('./discovery-search');
const purposeLabels={intro:'도입',explain:'개념 설명',inquiry:'탐구 소재',discussion:'비교·토의'};
function goalRequirements(plan){return plan.requirements.length?plan.requirements.map(r=>({id:r.id,text:r.text})):[{id:'official-standard',text:plan.standardText}];}
function lessonGoal(input,plan){
 const mode=input.standardMode||'candidates',goal=input.lessonGoal||'',purpose=input.usePurpose||'',ids=(input.goalRequirements||'').split(',').filter(Boolean),available=goalRequirements(plan);
 if(!['priority','candidates','verified'].includes(mode)||typeof goal!=='string'||goal.length>1000||!['',...Object.keys(purposeLabels)].includes(purpose)||ids.some(id=>!available.some(r=>r.id===id)))throw new DiscoveryInputError('수업 목표·요구·검색 범위를 확인하세요.');
 return {standardId:plan.standardId,curriculumVersion:plan.curriculumVersion||'2022 개정',standardText:plan.standardText,requirements:available.filter(r=>!ids.length||ids.includes(r.id)),lessonGoal:goal,usePurpose:purpose,purposeLabel:purposeLabels[purpose]||'',standardMode:mode,meaning:'교사의 수업 의도 · 영상/학생 수행 충족 판정 아님'};
}
module.exports={lessonGoal,goalRequirements,purposeLabels};
