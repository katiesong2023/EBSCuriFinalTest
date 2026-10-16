const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const source=require(require('node:path').resolve(__dirname,'..')+'/docs/r12-search-test-200-baseline.json');
const probes=require(require('node:path').resolve(__dirname,'..')+'/docs/r12-search-test-200-probes.json');
const reviews={
 Q001:[['PARTIAL','지역 특산물·생업을 담은 완도 사례. 요청자의 실제 고장과 일치하는지는 미확인.'],['PARTIAL','산청의 유산·한옥·전통문화 사례. 요청자의 고장은 미지정.'],['IRRELEVANT','고장(지역)이 아니라 신호등의 고장(故障). 동음이의어 오류.'],['PARTIAL','안동의 음식·지역 생활 사례. 고장 전반이나 특정 지역 확인은 미완료.'],['IRRELEVANT','지하철 고장이 줄거리 배경. 지역의 모습을 보여주는 주제가 아님.']],
 Q021:[['PARTIAL','고령화·노인을 언급하지만 주제는 혈액암 치료. 노인 생활보다 주변 건강 사례.'],['SOURCE_TOPIC_MATCH','고령화·지방 소멸과 시골 어르신들의 생활·만물트럭을 소개.'],['PARTIAL','노인성 질환·치료가 주제. 고령화 사회의 생활 설명으로는 범위가 좁음.'],['SOURCE_TOPIC_MATCH','초고령사회에서 베이비부머의 경제 활동·은퇴와 정책을 다룸.']],
 Q023:[['SOURCE_TOPIC_MATCH','다문화 가족·이웃 공동 육아·다양한 문화 생활이 소개문에 명시됨. 말레이시아 사례.']],
 Q049:[['IRRELEVANT','독립운동가는 내레이터의 외부 캠페인 경력에서만 등장. 본편은 탄광 수몰·유해 조사이며 사진은 보도자료 별첨 안내.']],
 Q050:[['PARTIAL','광복·전쟁 뒤 포천 마을과 실향민 생활의 사례. 두 사건 자체의 설명 자료는 아님. 소개문의 “1943년 광복 이후”는 사실 오류 의심으로 재확인 필요.']],
 Q079:[['SOURCE_TOPIC_MATCH','고비 사막의 유목민 삶과 낙타를 다루는 다큐로 소개됨.']],
 Q086:[['SOURCE_TOPIC_MATCH','학교를 사회화 과정의 공간으로 설명. 학교의 사회화 기능에 관한 후보 단서.'],['OTHER_CONTEXT','국제 인권 확산에서 사회화를 수단으로 언급. 개인의 사회화 과정·기관과 맥락이 다름.']],
 Q099:[['IRRELEVANT','도시 인구는 성범죄자 수를 비유하는 비교 수치. 도시 문제 자체가 주제가 아님.'],['INSUFFICIENT_SOURCE','소개에 도시 문제 해결이라고 명시되지만 설명이 매우 짧아 구체 내용 확인 필요.']],
 Q103:[['IRRELEVANT','잡초의 뿌리·땅속 공기와 씨앗을 옮기는 동물이 다른 문맥에 등장. 땅속 동물의 생활 영상 근거가 아님.']],
 Q121:[['SOURCE_TOPIC_MATCH','공식 보조 원문에 제주 우도·화산섬·화산분출 지형이 명시됨. 본편 중심은 해변과 홍조단괴.']],
 Q139:[['RELATION_UNCONFIRMED','외계 행성의 크기·질량과 태양계의 특수성 설명. 태양계 행성 크기를 비교하는 요청의 충족은 미확인.']],
 Q155:[['RELATION_UNCONFIRMED','지구 자전 속도가 느려지는 원리. 낮과 밤이 생기는 이유를 설명하는 근거는 없음.'],['RELATION_UNCONFIRMED','지구의 자전·공전 속도가 주제. 낮과 밤의 원인 설명은 소개문에서 확인되지 않음.']]
};
assert.equal(source.rows.length,200);assert.deepEqual(source.changedFiles,[]);
let quoteChecks=0,itemsChecked=0;
function inspect(item){itemsChecked++;const qs=[...(item.contentPreview?.evidence||[]),...(item.contentPreview?.metadataEvidence||[]),...(item.contentPreview?.keywordEvidence||[]),...(item.meaningMatches||[]).flatMap(m=>m.evidence||[]),...(item.searchExplanation?.topicEvidence||[]),...(item.searchExplanation?.supplementEvidence||[]),...(item.searchExplanation?.details||[]).flatMap(d=>d.evidence||[]),...(item.semanticTags||[]).map(t=>t.evidence),...(item.contentKeywords||[]).map(t=>t.evidence),...(item.genreEvidence||[]),...(item.semanticRetrieval?.evidence?[item.semanticRetrieval.evidence]:[])];for(const q of qs){if(!q||typeof q.quote!=='string')continue;if(['programCategory','programFormatEvidence'].includes(q.field)){assert.equal(q.sourceText,q.quote);quoteChecks++;continue}if(!Number.isInteger(q.start)||!Number.isInteger(q.end))continue;const text=q.field==='sourceSupplement'?(item.sourceSupplements||[]).find(s=>s.id===q.supplementId)?.text:item[q.field];assert.equal(typeof text,'string',item.id+' '+q.field);assert.equal(text.slice(q.start,q.end),q.quote,item.id+' '+q.field);quoteChecks++;}for(const other of item.alternatives||[])inspect(other)}
for(const row of source.rows)for(const item of row.api?.results||[])inspect(item);
const original=fs.readFileSync('EBS_Curi_FINAL_PACKAGE_v1.4/curi-search-test-200.xlsx');assert.equal(crypto.createHash('sha256').update(original).digest('hex'),source.inputSourceSha256);
const prior=require(require('node:path').resolve(__dirname,'..')+'/docs/r12-03-development170.json'),norm=s=>s.normalize('NFKC').replace(/\s+/g,'').toLowerCase();
const baseNote={ '키워드형':'복수 내용어의 동시 충족·원천 공백을 분리 점검', '질문형':'질문 문법·핵심 개념 추출과 원리 근거 대조 필요', '수업 활용형':'수업 활용 문구·길이·학년 조건 해석과 원천을 분리 점검', '형식 지정형':'주제와 요청 형식의 동시 충족·원천 공백을 분리 점검', '구어체·모호':'구어체 요청 문구가 필수 내용어로 남는지 점검', '오타·띄어쓰기':'오타 교정·붙여쓰기 해석·원천 공백을 분리 점검', '제외 조건':'제외 조건을 유지한 후보 발견·관련 근거 점검', '프로그램명 포함':'프로그램 범위와 남은 요청 문구·주제를 분리 점검', '복합·융합 조건':'여러 주제·관계의 동시 충족·원천 공백을 분리 점검'};
const rows=source.rows.map(row=>{const p=probes.rows.find(p=>p.id===row.request.id);const candidateReview=(reviews[row.request.id]||[]).map(([status,note],i)=>({rank:i+1,id:row.top5[i].id,status,note}));assert.equal(candidateReview.length,row.top5?.length||0);let note=row.error?'실행 오류: '+row.error.message:row.total?candidateReview.map(r=>r.rank+'위 '+r.note).join(' / '):'0건. '+(baseNote[row.request.queryType]||'원천·검색 해석 확인 필요');if(p)note+=' / 별도 진단: “'+p.query+'” '+p.total+'건. '+p.change+'(원래 조건 충족을 의미하지 않음).';return {id:row.request.id,query:row.request.query,total:row.total,terms:row.api?.terms||[],concepts:row.api?.concepts||[],note,candidateReview,probe:p?{query:p.query,total:p.total,change:p.change}:null}});
const count=list=>({requests:list.length,nonempty:list.filter(r=>r.total>0).length,empty:list.filter(r=>r.total===0).length,errors:list.filter(r=>r.error).length,top5Pairs:list.reduce((n,r)=>n+(r.top5?.length||0),0)});
const grouped=keys=>[...new Set(source.rows.map(r=>keys.map(k=>r.request[k]).join(' / ')))].map(key=>({key,...count(source.rows.filter(r=>keys.map(k=>r.request[k]).join(' / ')===key))}));
const reviewCounts={};for(const r of rows)for(const c of r.candidateReview)reviewCounts[c.status]=(reviewCounts[c.status]||0)+1;
const positiveProbes=probes.rows.map(p=>({id:p.id,original:source.rows.find(r=>r.request.id===p.id).total,probe:p.total,query:p.query,change:p.change}));
const analysis={analyzedAt:new Date().toISOString(),totals:count(source.rows),byCourseSubject:grouped(['grade','subject']),byQueryType:grouped(['queryType']),bySubject:grouped(['subject']),exactNormalizedQueryOverlap170:source.rows.filter(r=>prior.rows.some(p=>norm(p.query)===norm(r.request.query))).map(r=>r.request.id),reviewCounts,reviewScope:'상위5개22후보의 제목·소개·공식 보조 원문을 에이전트가 잠정 점검. 수업 적합성 점수/교사 정답 평가 아님.',quoteChecks,itemsAndVariantsChecked:itemsChecked,inputUnchanged:true,changedFiles:source.changedFiles,paidApiCalls:0,diagnosticProbes:positiveProbes,rows};
fs.writeFileSync('docs/r12-search-test-200-analysis.json',JSON.stringify(analysis,null,2)+'\n');console.log(JSON.stringify({...analysis,rows:undefined},null,2));
