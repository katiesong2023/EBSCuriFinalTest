const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {discoverRelatedStandards}=require('./curriculum-related');
const {readDataStore}=require('./data-store');
(async()=>{
 const store=await readDataStore(),cases=[],failures=[];
 const specs=[
  ['다문화 교실','이주 배경 학생들이 서로 다른 문화를 배우고 존중한다.',['4사03-02'],['9사(지리)02-02','6사12-02']],
  ['공존하는 마을','여러 문화의 가족들이 함께 살아가며 서로의 생활양식을 존중한다.',['4사03-02'],[]],
  ['문화 다양성','나와 다른 사람이나 집단의 문화를 이해하고 존중하는 방법을 살펴본다.',['4사03-02'],['9사(지리)02-02']],
  ['국권 회복을 위한 노력','항일투쟁을 벌인 사람들의 발자취를 따라간다.',['6사06-01'],[]],
  ['독립 운동의 기록','독립운동가들이 일제에 맞섰던 이야기를 다룬다.',['6사06-01'],[]],
  ['나라를 되찾는 사람들','국권을 되찾는 사람들의 희생을 소개한다.',['6사06-01'],[]],
  ['혼자 서는 청년','경제적 독립을 위해 취업하고 혼자 살기 시작한다.',[],['6사06-01']],
  ['미국의 독립운동','미국 독립운동과 프랑스의 지원을 소개한다.',[],['6사06-01']],
  ['인도 독립운동','영국의 지배에 맞선 인도의 독립운동을 소개한다.',[],['6사06-01']],
  ['아시아의 문화경관','아시아의 종교와 다양한 문화경관을 살펴본다.',['9사(지리)02-02'],['9사(지리)04-02']],
  ['아프리카의 문화','아프리카의 다양한 문화와 생활양식을 소개한다.',['9사(지리)04-02'],['9사(지리)02-02']],
  ['결석과 건강','우리나라 인구 10명 중 한 명이 겪는 요로결석의 증상과 치료법을 살펴본다.',['6과04-03'],['4사10-02','6사02-02','6사12-01','9사(지리)02-03']],
  ['인구의 변화','고령화와 저출산으로 인구 분포와 인구 구조가 바뀌는 현상을 살펴본다.',['6사02-02'],[]],
  ['작은 지구촌 교실','다문화 학생들의 교실을 작은 지구촌이라고 부른다.',['4사03-02'],['6사12-02']],
  ['민주주의의 발전','인류 역사 속 민주주의가 발전해 온 과정을 알아본다.',['9사(일사)03-01'],['4사02-02','4사06-02','6사08-03']],
  ['학교 자치','학생회에서 학교 선거를 진행하고 학생 자치를 실천한다.',['4사08-01'],[]],
  ['화산 활동','화산에서 용암과 화산재가 나오는 모습을 관찰한다.',['4과11-02'],['6과14-04']],
  ['물질하는 해녀','제주 해녀가 바다에서 물질하며 소라와 전복을 잡는다.',[],['4과05-01','4과05-02','6과14-01']],
  ['전자기학','전류가 만드는 자기장과 전자석의 성질을 실험한다.',['6과15-03'],['6과11-02','6과09-02','9과05-02']],
  ['전기 안전','누전과 감전 사고를 막고 전기를 절약하는 방법을 알아본다.',['6과15-04'],[]],
  ['전기 회로','전지와 전구, 전선을 연결해 불을 켜는 회로를 만든다.',['6과15-01'],[]],
  ['해조류 건강 상식','바다 채소 해조류가 몸속 혈관 건강과 질병 예방에 주는 도움을 설명한다.',['6과04-03'],['4과06-01','4과05-02']],
  ['소금물 실험','소금물에서 물을 증발시켜 소금을 분리한다.',['6과05-02'],[]],
  ['먹고 먹히는 관계','숲에서 포식자와 피식자가 먹이 사슬을 이루는 모습을 소개한다.',['4과14-02'],[]],
  ['도시의 심장','도시의 심장은 금융 산업의 중심지를 뜻하는 비유이다.',[],['6과04-02','6과04-03']],
  ['살아 있는 화석','이 동물은 아주 오래전 모습 때문에 살아 있는 화석이라는 별명을 얻었다.',[],['6과01-03']],
  ['바다를 지키는 생물','갯벌 생물들의 서식지와 갯벌 보전의 필요성을 다룬다.',['4과06-03'],['6사01-01']],
  ['과거를 보여주는 물건','오래된 사진과 유물을 살펴보며 과거의 모습을 알아본다.',['4사02-02'],[]],
  ['지구 온난화','기후 위기가 환경과 사람들의 생활에 미치는 영향을 살펴본다.',['4과16-02'],[]],
  ['미디어 판별','뉴스와 미디어에 담긴 가짜 정보를 구분하고 비판적으로 읽는다.',['6사08-03'],[]],
  ['중력과 부력','물체에 작용하는 중력과 부력의 방향과 특징을 비교한다.',['9과05-02'],[]],
  ['초승달 관찰','달의 모양이 날짜에 따라 변하는 까닭과 초승달을 관찰한다.',['4과13-01'],[]],
  ['비유 제목의 정정','독립운동을 다루지 않는 영상이다.',[],['6사06-01']],
  ['학교 결석','학교를 결석한 학생들의 출석 기록을 소개한다.',[],['6과04-02','6과04-03']],
  ['화재 소화','화재를 소화하는 소방관을 소개한다.',[],['6과04-02']],
  ['원리 실험','다른 원리와 실험, 주변의 여러 모습을 소개한다.',[],[],true]
 ];
 for(const [title,summary,include,exclude,empty] of specs){
  try{const input={title,summary},d=await discoverRelatedStandards(input,store),ids=d.related.map(x=>x.id);
   for(const id of include)assert.ok(ids.includes(id),`누락 ${id}: ${ids}`);
   for(const id of exclude)assert.ok(!ids.includes(id),`무관 ${id}: ${ids}`);
   if(empty)assert.equal(ids.length,0);
   for(const c of d.related){assert.ok(c.evidence.length);for(const e of c.evidence)assert.equal(input[e.field].slice(e.start,e.end),e.quote);}
   cases.push({name:title,ids});
  }catch(e){failures.push({name:title,message:e.message});}
 }
 const tail='이주 배경 어린이들이 서로 다른 문화를 배우고 존중한다.';
 const summary='방송의 제작 배경을 소개합니다. '.repeat(100)+tail;
 const full=await discoverRelatedStandards({title:'교실에서 일어난 일',summary,searchQuery:'다문화'},store);
 assert.ok(full.related.some(x=>x.id==='4사03-02'));
 assert.ok(full.related.find(x=>x.id==='4사03-02').evidence.some(e=>e.field==='summary'&&e.start>200));
 cases.push({name:'200자/2000자 뒤 실제 내용과 원문 위치',contentLength:full.contentLength});
 for(const input of [null,[],{summary:3},{summary:'x'.repeat(200001)},{title:'x'.repeat(2001)},{q:'다문화',summary:'다문화'}]) await assert.rejects(()=>discoverRelatedStandards(input,store));
 cases.push({name:'본문 형식·길이·혼합 입력 검증'});
 await fs.writeFile('docs/r12-34-content-meaning-check.json',JSON.stringify({checkedAt:new Date().toISOString(),passed:cases.length,cases,failures,paidApiCalls:0},null,2)+'\n');
 console.log(JSON.stringify({passed:cases.length,failures}));assert.equal(failures.length,0);
})().catch(e=>{console.error(e);process.exitCode=1});
