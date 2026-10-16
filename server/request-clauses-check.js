// 개발170과 다른 표현/가상 원문으로 공통 문장 규칙의 보존과 검색 경계를 확인한다.
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {parseDiscoveryIntent:parse}=require('./discovery-intent'),{discoverContents}=require('./discovery-search');
const {parseGradeRequest}=require('../public/grade-context');
const item=(id,title,summary,program='검사 프로그램')=>({id,title,summary,program,kind:'episode',sourceUrl:'https://www.ebs.co.kr/'+id});
const catalog={version:'r12-clause-fixture',concepts:[],stats:{},resources:[
 item('ELECTRO','전자석 만들기','전자석의 코일에 전류가 흐르면 클립이 붙고 전원을 끄면 떨어진다.'),
 item('MAGNET','막대자석','자석의 같은 극은 밀어내며 다른 극은 붙는다.'),
 item('FLOAT','부력 실험','부력은 물에 잠긴 물체를 위로 밀어 올리는 힘이다.'),
 item('GRAVITY','중력 실험','중력에 의해 물체가 지구로 떨어진다.'),
 item('MOON','달 관찰','달의 모양을 매일 기록해 보자.'),
 item('MOON_AD','달 관찰','달의 모양을 담은 방문객 모집 광고'),
 item('RIGHTS','인권 이야기','인권과 차별의 사례를 살펴보는 애니메이션이다.'),
 item('RIGHTS_DOC','인권 이야기','인권과 차별의 사례를 살펴보는 다큐멘터리이다.'),
 item('LUNG','호흡 기관','허파는 호흡 기관이며 산소를 받아들인다.')
]};
const cases=[];const check=async(name,run)=>{await run();cases.push(name)};
const find=q=>discoverContents({q},catalog,{useSemantic:false});const ids=async q=>(await find(q)).results.map(x=>x.id);
(async()=>{
 await check('문장 범위 제외·긍정 주제 보존',()=>{const u=parse('달 자료를 찾아주세요 방문객 모집 광고는 제외해 주세요');assert.ok(u.excluded.includes('방문객 모집 광고'));assert.ok(u.positiveQuery.includes('달'));assert.ok(!u.terms.includes('방문객'));});
 await check('띄어 쓴 빼 주세요·복수 제외 범위 보존',()=>{const u=parse('달 영상 찾는데 재난 피해 장면이나 사람이 다치는 모습은 빼 주세요');assert.equal(u.constraints.exclusionClauses[0].label,'재난 피해 장면이나 사람이 다치는 모습');});
 await check('원문에 제외 표현 있는 후보 차단·부재 확정 없음',async()=>{const r=await find('달 영상 찾는데 방문객 모집 광고는 빼 주세요');assert.ok(r.results.some(x=>x.id==='MOON'));assert.ok(!r.results.some(x=>x.id==='MOON_AD'));assert.equal(r.results.find(x=>x.id==='MOON').excludedConditions[0].status,'UNKNOWN');});
 await check('선호 없이도 주제 후보 유지·확인된 형식만 가점',async()=>{const r=await find('인권 자료요. 가능하면 다큐 형식이면 좋겠어요');assert.deepEqual(r.results.map(x=>x.id),['RIGHTS_DOC','RIGHTS']);assert.deepEqual(r.understanding.constraints.requiredGenres,[]);});
 await check('해외 선호가 필수 지역 범위가 아님',()=>{const u=parse('달 관찰 자료요. 가능하면 외국 사례도 들어 있으면 좋겠어요');assert.ok(!u.constraints.geographicScope);assert.equal(u.preferences.content.length,1);});
 await check('뒤 절 필수 내용은 선호에 흡수하지 않음',()=>{const u=parse('인권 자료요. 가능하면 다큐 형식이고, 반드시 차별과 평등이 모두 나와야 해요');assert.ok(u.positiveQuery.includes('차별'));assert.ok(u.positiveQuery.includes('평등'));assert.ok(!u.preferences.content[0].label.includes('차별'));});
 await check('교실 토론 시작 목적은 인터뷰 필수 아님',()=>{const u=parse('인권 사례로 토론을 시작할 때 보여줄 도입 자료');assert.deepEqual(u.constraints.requiredGenres,[]);assert.ok(u.classroomContext.length);});
 await check('교실 실험 전은 시연 필수 아님',()=>assert.deepEqual(parse('빛을 실험 전에 알아보는 도입 자료').constraints.requiredGenres,[]));
 await check('명시 실험 형식은 유지',()=>assert.ok(parse('빛 실험 형식 영상').constraints.requiredGenres.includes('실험·시연')));
 await check('주사기 실험을 보여줄 요청은 유지',()=>assert.ok(parse('주사기 실험을 보여주는 영상').constraints.requiredGenres.includes('실험·시연')));
 await check('전자석은 막대자석으로 대체하지 않음',async()=>assert.deepEqual(await ids('전자석'),['ELECTRO']));
 await check('부력과 중력의 넓은 힘 묶음 구분',async()=>assert.deepEqual(await ids('부력'),['FLOAT']));
 await check('상위 자석 요청은 세부 후보 함께 탐색',async()=>assert.deepEqual(new Set(await ids('자석')),new Set(['ELECTRO','MAGNET'])));
 await check('비유를 실제 호흡 기관으로 해석하지 않음',async()=>{const r=await find('도시의 허파를 설명해주는 자료');assert.ok(!r.understanding.concepts.some(x=>x.id==='respiration'));assert.ok(!r.results.some(x=>x.id==='LUNG'));});
 await check('미지 고유명·명시 AND 자동 완화 없음',async()=>assert.deepEqual(await ids('전자석과 은빛가상금속을 모두 다루는 영상'),[]));
 await check('시대 숫자를 학년으로 해석하지 않음·명시 학년 유지',()=>{assert.equal(parseGradeRequest('1970~80년대 산업').source,'all');assert.equal(parseGradeRequest('중학교1학년 전자석').source,'query');});
 await check('기존 프로그램 제외는 프로그램 필드로만',()=>{const u=parse('달 다큐프라임 말고',{programNames:['EBS 다큐프라임']});assert.deepEqual(u.constraints.excludedPrograms,['EBS 다큐프라임']);assert.deepEqual(u.excluded,[]);});
 await check('지역 제외는 기존 지역 범위 해석으로 위임',()=>{const u=parse('한국 제외하고 화산');assert.deepEqual(u.constraints.geographicScope.required,['FOREIGN']);assert.deepEqual(u.excluded,[]);});
 await check('해외 사례 제외의 국내 범위·긍정 주제 보존',()=>{const u=parse('화산 지형 해외 사례는 제외해줘');assert.deepEqual(u.constraints.geographicScope.required,['DOMESTIC']);assert.ok(u.concepts.some(c=>c.id==='volcano'));});
 await fs.writeFile('docs/r12-03-clauses-check.json',JSON.stringify({cases,passed:cases.length,paidApiCalls:0,scope:'독립 표현·가상 텍스트 계약. 교사/영상 의미 평가 아님.'},null,2)+'\n');console.log(cases.length,'공통 원인 계약 통과');
})().catch(e=>{console.error(e);process.exitCode=1});
