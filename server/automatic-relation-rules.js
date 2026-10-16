const ruleVersion = `automatic-evidence-v3:${require("./source-text-quality").qualityVersion}`;
const { assessRequirement, discoveryTerms, uncertainText } = require('./automatic-relation-language');

// 공식 원문과 버전이 같은 지원 기준의 일부 명시적 설명만 판정한다. 학생의 수행·태도는 검사하지 않는다.
const rules = [
  {
    id: "election-and-sovereignty", standardId: "6사08-01", subject: "사회",
    standardText: "민주주의에서 선거의 의미와 역할을 파악하고, 시민의 주권 행사를 위해 선거에 참여하는 태도를 기른다.",
    topic: /선거|투표|주권|대표자?|시민|유권자/u,
    requirements: [
      { id: "representative-selection", text: "시민이 투표로 대표를 뽑는 선거의 역할",
        pattern: /^(?:시민|유권자|국민)(?:들)?(?:은|는|이|가)\s*(?:선거에서\s*)?투표(?:를\s*통해|로)\s*(?:자신들의?\s*)?대표(?:자)?를\s*(?:선출|선택|뽑)(?:한다|합니다|는다|습니다)[.!。]?$/u },
      { id: "sovereign-expression", text: "선거 참여와 시민 주권 행사의 연결",
        pattern: /^(?:시민|유권자|국민)(?:들)?(?:은|는|이|가)\s*(?:선거|투표)(?:\s*참여)?(?:를\s*통해|로)\s*(?:자신의\s*)?주권을\s*행사(?:한다|합니다)[.!。]?$/u }
    ],
    unverified: ["학생이 선거의 의미·역할을 이해했는지", "실제 선거 참여 태도와 수업 활용 적합성"]
  },
  {
    id: "rotation-and-day-night", standardId: "6과12-02", subject: "과학",
    standardText: "지구의 자전을 알고, 낮과 밤이 생기는 이유를 설명할 수 있다.",
    topic: /지구|자전|공전|낮|밤/u,
    requirements: [
      { id: "rotation", text: "지구가 스스로 회전한다는 자전 설명",
        pattern: /^지구(?:는|가)\s*(?:자전축을\s*중심으로\s*)?(?:스스로\s*)?(?:자전|회전)(?:한다|합니다)[.!。]?$/u },
      { id: "day-night-cause", text: "지구 자전이 낮과 밤을 만드는 원인이라는 설명",
        pattern: /^지구(?:의\s*자전(?:으로\s*인해|\s*때문에)|가\s*자전(?:하므로|하기\s*때문에|해서))[,\s]*(?:낮과\s*밤|밤과\s*낮)이\s*(?:번갈아\s*)?(?:생긴다|생깁니다|생기는\s*것이다|생기는\s*것입니다)[.!。]?$/u }
    ],
    unverified: ["영상 속 관찰·모형·장면의 실제 내용", "학생이 낮과 밤의 원인을 설명할 수 있는지"]
  },
  {
    id: "bronze-artifact-and-farming", standardId: "6사04-01", subject: "사회",
    standardText: "선사 시대와 고조선의 유적과 유물을 활용하여 당시 사람들의 생활을 추론한다.",
    requiredForPublication: ["artifact-period", "farming-depiction"],
    topic: /농경문\s*청동기|청동기\s*시대|밭을\s*갈/u,
    requirements: [
      { id: "artifact-period", text: "농경문 청동기를 청동기 시대의 문화유산으로 소개하는 설명",
        pattern: /^(?:‘최고의 명품 청동기’라 불리는\s*)?농경문\s*청동기는\s*청동기\s*시대[^.!?。]*문화유산이다[.!。]?$/u },
      { id: "farming-depiction", text: "농경문 청동기의 문양에 밭을 가는 사람이 그려진 사례",
        requires: "artifact-period",
        context: /농경문\s*청동기[^.!?。]*그려진[^.!?。]*문양/u,
        pattern: /^그림을 자세히 보면 ‘벌거벗은 남자’가 밭을 갈고 있는 걸 볼 수 있다[.!。]?$/u }
    ],
    unverified: ["해당 유물의 고조선 소속 여부", "원문에서 소개한 사례 외 당시 생활 전반", "학생이 유적·유물로 당시 생활을 추론하는 수행", "영상의 실제 장면·학년 적합성"]
  },
  {
    id: "combustion-and-ecosystem-damage", standardId: "6과14-04", subject: "과학",
    standardText: "연소 과정에서 생성되는 물질로 인한 생태계의 피해 사례를 수집하고 분석하여 해결책을 제안하고 공유할 수 있다.",
    requiredForPublication: ["combustion-emissions", "emissions-damage"],
    topic: /연소|석탄|석유|화석연료|이산화탄소|황산화물|질소산화물|산성비|생태계/u,
    requirements: [
      { id: "combustion-emissions", text: "화석연료가 탈 때 오염 물질이 발생하는 관계",
        pattern: /^(?:석탄|석유|화석연료)(?:을|를)\s*(?:태우면|태울\s*때|연소시키면)\s*(?:이산화탄소|황산화물|질소산화물)(?:가|이)\s*(?:발생|배출)(?:한다|된다|됩니다)[.!。]?$/u },
      { id: "emissions-damage", text: "연소 생성물이 산성비를 거쳐 산림·수중 생태계에 피해를 주는 관계",
        requires: "combustion-emissions",
        pattern: /^(?:이|배출된)\s*(?:황산화물|질소산화물)(?:은|는)\s*산성비를\s*일으켜\s*(?:산림|숲|호수|하천)(?:의|에)\s*(?:생물|물고기|나무|생태계)(?:에게|에)?\s*피해를\s*준다[.!。]?$/u }
    ],
    unverified: ["영상 속 피해 장면과 수치의 확인", "다른 연소 생성물·피해 경로", "학생의 피해 사례 수집·분석·해결책 제안·공유 수행"]
  }

];

function sourceSentences(text) {
  return require("./source-explanation").sourceSentences(text, "synopsis");
}

function assessRelation(resource, standard) {
  const rule = rules.find((entry) => entry.standardId === standard.metadata.achievementStandardId);
  const unsupported = (reason) => ({ ruleId: rule?.id ?? null, status: "UNSUPPORTED", reason,
    supportedRequirements: [], connectedParts: [], unconfirmedParts: [standard.metadata.achievementStandard],
    standardCoverage: "NONE", evidence: [] });
  if (!rule) return unsupported("이 성취기준의 학습 관계는 현재 로컬 규칙의 지원 범위 밖입니다.");
  if (standard.curriculumVersion !== "2022 개정" || standard.metadata.achievementStandard !== rule.standardText ||
      standard.metadata.subject !== rule.subject) {
    return unsupported("규칙을 정의할 때 사용한 공식 성취기준 원문·버전과 다릅니다.");
  }
  const sentences = sourceSentences(resource.synopsis);
  const requirementResults = rule.requirements.map(requirement => assessRequirement(requirement, rule, sentences, resource.synopsis));
  for (const requirement of rule.requirements.filter(entry => entry.requires)) {
    const result = requirementResults.find(entry => entry.id === requirement.id);
    const parent = requirementResults.find(entry => entry.id === requirement.requires);
    if (result.status !== 'SUPPORTED') continue;
    let dependencyConfirmed = parent?.status === 'SUPPORTED';
    if (requirement.id === 'emissions-damage' && dependencyConfirmed) {
      // 다른 물질의 두 문장을 합쳐 연소→피해 관계를 만들지 않는다.
      dependencyConfirmed = result.evidence.some(effect => parent.evidence.some(cause => cause.end <= effect.start && effect.start - cause.end <= 300 &&
        ['황산화물', '질소산화물'].some(substance => cause.quote.includes(substance) && effect.quote.includes(substance))));
    }
    if (!dependencyConfirmed) Object.assign(result, { status: 'NOT_CONFIRMED', evidence: [], reason: '연결에 필요한 앞선 대상·생성물의 근거가 없거나 서로 다릅니다.' });
  }
  const explicitConflicts = requirementResults.filter(result => result.status === 'EXPLICIT_CONFLICT');
  const supported = requirementResults.filter(result => result.status === 'SUPPORTED');
  const uncertain = requirementResults.some(result => result.status === 'INTERPRETATION_HELD') ||
    !supported.length && sentences.some(sentence => rule.topic.test(sentence.quote) && uncertainText(sentence.quote));
  let status = explicitConflicts.length ? "CONFLICT" : uncertain || !supported.length ? "HELD" :
    supported.length === rule.requirements.length ? "SUPPORTED" : "PARTIAL";
  const missingCore = (rule.requiredForPublication || []).some(id => !supported.some(result => result.id === id));
  if (missingCore && !["CONFLICT", "UNSUPPORTED"].includes(status)) status = "HELD";
  return {
    ruleId: rule.id, status,
    reason: explicitConflicts.length ? "같은 요구 관계를 명시적으로 부정하거나 다른 원인으로 설명해 자동 제공을 보류합니다." :
      uncertain ? "관련 문장이 의문·추측·인용·조건을 포함해 자동 제공을 보류합니다." :
        missingCore ? "핵심 대상·관계·조건 중 확인되지 않은 부분이 있어 자동 제공을 보류합니다." :
        supported.length ? "지원하는 명시적 설명을 소개문에서 확인했습니다. 전체 성취기준 충족은 미확인입니다." :
          "관련 단어만으로는 지원하는 학습 관계를 확인할 수 없습니다.",
    supportedRequirements: supported.map(({ id, text }) => ({ id, text })),
    connectedParts: supported.map(result => result.text),
    unconfirmedParts: [...rule.requirements.filter((requirement) => !supported.some((result) => result.id === requirement.id))
      .map((requirement) => requirement.text), ...rule.unverified],
    standardCoverage: supported.length ? "PARTIAL" : "NONE",
    requirementResults, explicitConflicts: explicitConflicts.map(({ id, text, evidence }) => ({ id, text, evidence })),
    interpretationHeld: uncertain,
    ignoredNegations: sentences.filter(sentence => /폭력을\s*사용하지\s*않고도/.test(sentence.quote))
      .map(sentence => ({ target: '폭력 사용', reason: '이 부정만으로 선거·주권 관계의 부정을 판정하지 않습니다.', ...sentence })),
    evidence: [...new Map(supported.flatMap(result => result.evidence).map(sentence => [sentence.start, sentence])).values()]
  };
}

function ruleScope() {
  return { version: ruleVersion, curriculumVersion: "2022 개정", gradeBand: "5~6학년군",
    rules: rules.map((rule) => ({ id: rule.id, subject: rule.subject, standardId: rule.standardId,
      standardText: rule.standardText, requirements: rule.requirements.map(({ id, text }) => ({ id, text })),
      unverified: rule.unverified, discoveryTerms: discoveryTerms[rule.standardId] || [] })),
    limitation: "제한된 한국어 서술 패턴 검사이며 의미 정확도·영상 내용·학년 적합성을 보증하지 않습니다." };
}

// 화면의 요구별 대응은 판정에 실제 사용한 문장만 연결한다. 발견용 단어 인용을 섞지 않는다.
function requirementEvidence(resource, standard, assessment = assessRelation(resource, standard)) {
  const rule = rules.find(entry => entry.standardId === standard.metadata.achievementStandardId && entry.standardText === standard.metadata.achievementStandard);
  if (!rule || assessment.status === "UNSUPPORTED") return [];
  if (assessment.requirementResults) return assessment.requirementResults;
  return rule.requirements.map(requirement => {
    const supported = assessment.supportedRequirements.some(entry => entry.id === requirement.id);
    const evidence = supported ? assessment.evidence.filter(sentence => requirement.pattern.test(sentence.quote)) : [];
    return { id: requirement.id, text: requirement.text, status: evidence.length ? "SUPPORTED" : "NOT_CONFIRMED", evidence,
      reason: evidence.length ? "이 요구의 제한된 서술 패턴과 직접 대응하는 원문입니다." : assessment.reason };
  });
}

module.exports = { ruleVersion, ruleScope, assessRelation, sourceSentences, requirementEvidence };
