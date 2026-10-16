// 지원하는 네 기준의 명시적 서술·부정 대상을 제한한다. 일반적인 한국어 의미 분석기가 아니다.
const language = {
  'representative-selection': {
    scope: /(?:선거|투표|표를\s*던|시민|유권자|국민)[^.!?。]*(?:대표|통치자|선출|뽑)/u,
    patterns: [
      /^(?:시민|유권자|국민)(?:들)?(?:은|는|이|가)\s*(?:폭력을\s*사용하지\s*않고도\s*)?(?:선거(?:에서|를\s*통해|로)|투표(?:를\s*통해|로)|표를\s*던져)\s*(?:자신들의?\s*|자신의\s*)?(?:대표(?:자)?|통치자)를\s*(?:선출한다|선출합니다|선택한다|선택합니다|뽑는다|뽑습니다)[.!。]?$/u,
      /^선거(?:는|란)\s*(?:시민|국민|유권자)(?:이|가)\s*(?:투표로\s*)?(?:대표(?:자)?|통치자)를\s*(?:뽑는|선출하는|선택하는)\s*(?:제도|과정|방법)(?:이다|입니다)[.!。]?$/u
    ],
    conflict: /(?:선거|투표)[^.!?。]{0,45}(?:대표|통치자)[^.!?。]{0,25}(?:선출|뽑|선택)[^.!?。]{0,15}(?:않|못|없|아니)|(?:선거|투표)[^.!?。]{0,30}(?:대표|통치자)[^.!?。]{0,20}(?:무관|관계가\s*없)/u
  },
  'sovereign-expression': {
    scope: /(?:선거|투표|시민|유권자|국민)[^.!?。]*주권/u,
    patterns: [
      /^(?:시민|유권자|국민)(?:들)?(?:은|는|이|가)\s*(?:폭력을\s*사용하지\s*않고도\s*)?(?:선거|투표)(?:에\s*참여해|에\s*참여하여|\s*참여를\s*통해|를\s*통해|로)\s*(?:자신의\s*)?주권을\s*행사(?:한다|합니다)[.!。]?$/u,
      /^선거(?:는|란)\s*(?:시민|국민|유권자)(?:이|가)\s*주권을\s*행사하는\s*(?:방법|과정|제도)(?:이다|입니다)[.!。]?$/u
    ],
    conflict: /(?:선거|투표)[^.!?。]{0,35}주권[^.!?。]{0,25}(?:관계가\s*없|무관|행사하지\s*않|행사할\s*수\s*없|아니)/u
  },
  rotation: {
    scope: /^(?![^.!?。]*(?:낮|밤))[^.!?。]*지구[^.!?。]*(?:자전|회전|스스로\s*돌)/u,
    patterns: [/^지구(?:는|가)\s*(?:자전축을\s*중심으로\s*)?스스로\s*(?:돈다|돕니다|돌고\s*있다|회전한다|회전합니다)[.!。]?$/u],
    conflict: /^지구(?:는|가)\s*(?:스스로\s*)?(?:자전|회전)(?:하지\s*않|할\s*수\s*없)|^지구(?:는|가)\s*스스로\s*돌지\s*않/u
  },
  'day-night-cause': {
    scope: /(?:낮과\s*밤|밤과\s*낮|낮이\s*되고|밤이\s*되는)/u,
    patterns: [
      /^지구(?:가\s*(?:자전|회전)하기\s*때문에|가\s*스스로\s*돌기\s*때문에|의\s*(?:자전|회전)(?:으로|\s*때문에))[,\s]*(?:낮과\s*밤|밤과\s*낮)이\s*(?:번갈아\s*)?(?:생긴다|생깁니다|나타난다|나타납니다)[.!。]?$/u,
      /^지구가\s*자전하면서\s*햇빛을\s*받는\s*쪽은\s*낮이\s*되고\s*받지\s*못하는\s*쪽은\s*밤이\s*된다[.!。]?$/u
    ],
    conflict: /(?:공전|태양의?\s*이동)[^.!?。]{0,20}(?:때문|인해|하므로|해서)[^.!?。]{0,20}(?:낮과\s*밤|밤과\s*낮)|자전[^.!?。]{0,20}(?:낮과\s*밤|밤과\s*낮)[^.!?。]{0,25}(?:관계가\s*없|무관|원인이\s*아니|만들지\s*않)|(?:낮과\s*밤|밤과\s*낮)[^.!?。]{0,30}자전[^.!?。]{0,20}(?:무관|때문이\s*아니)/u
  },
  'artifact-period': {
    scope: /농경문\s*청동기[^.!?。]*청동기\s*시대(?:의)?\s*(?:유물|문화유산)/u,
    patterns: [/^농경문\s*청동기(?:는|란)\s*청동기\s*시대의\s*(?:유물|문화유산)(?:이다|입니다)[.!。]?$/u],
    conflict: /농경문\s*청동기[^.!?。]{0,30}(?:청동기\s*시대|문화유산|유물)[^.!?。]{0,15}(?:아니|무관|거짓)/u
  },
  'farming-depiction': {
    scope: /(?:농경문\s*청동기|그림|문양)[^.!?。]*(?:밭|농사|농경)/u,
    patterns: [/^농경문\s*청동기의\s*문양에는\s*(?:사람|남자)(?:이|가)\s*밭을\s*가는\s*모습이\s*그려져\s*있다[.!。]?$/u],
    directContext: /^농경문\s*청동기의\s*문양에는/u,
    conflict: /(?:농경문\s*청동기|그림|문양)[^.!?。]{0,40}밭[^.!?。]{0,25}(?:갈고\s*있지\s*않|가는\s*모습이\s*아니|그려져\s*있지\s*않|무관)/u
  },
  'combustion-emissions': {
    scope: /(?:석탄|석유|화석연료|연소)[^.!?。]*(?:이산화탄소|황산화물|질소산화물|배출|발생)/u,
    patterns: [/^(?:석탄|석유|화석연료)(?:이|가)\s*(?:탈\s*때|타면서|연소할\s*때)\s*(?:이산화탄소|황산화물|질소산화물)(?:가|이)\s*(?:발생한다|발생합니다|배출된다|배출됩니다|생긴다)[.!。]?$/u],
    conflict: /(?:석탄|석유|화석연료|연소)[^.!?。]{0,35}(?:이산화탄소|황산화물|질소산화물)[^.!?。]{0,20}(?:발생하지\s*않|배출되지\s*않|생기지\s*않|관계가\s*없)/u
  },
  'emissions-damage': {
    scope: /(?:산성비|황산화물|질소산화물)[^.!?。]*(?:산림|숲|호수|하천|피해|생태계)/u,
    patterns: [/^(?:배출된\s*)?(?:황산화물|질소산화물)(?:이|가)\s*산성비를\s*만들어\s*(?:산림|숲|호수|하천)(?:의|에)\s*(?:생물|물고기|나무|생태계)(?:에게|에)?\s*피해를\s*준다[.!。]?$/u],
    conflict: /(?:산성비|황산화물|질소산화물)[^.!?。]{0,35}(?:산림|숲|호수|하천|생태계)[^.!?。]{0,20}(?:피해가\s*없|피해를\s*주지\s*않|무관)/u
  }
};

const discoveryTerms = {
  '6사08-01': ['표를 던져', '대표자', '유권자', '통치자'],
  '6과12-02': ['스스로 돈다', '스스로 돌기', '지구가 회전', '지구는 회전', '낮과 밤'],
  '6사04-01': ['농경문 청동기', '농경문청동기', '밭을 가는'],
  '6과14-04': ['황산화물', '질소산화물', '산성비', '화석연료', '석탄을 태우면']
};
const uncertainText = text => /[?？]|일까|일지|가설|추측|라는\s*주장|라고\s*(?:주장|말)|만약|가정하면|상상|수\s*있|[“”"]/u.test(text);

function assessRequirement(requirement, rule, sentences, text) {
  const config = language[requirement.id], matches = [], held = [], conflicts = [];
  for (const sentence of sentences) {
    const directMatch = requirement.pattern.test(sentence.quote) || config?.patterns.some(pattern => pattern.test(sentence.quote));
    const inScope = directMatch || config?.scope.test(sentence.quote);
    if (!inScope) continue;
    // 명시적 관계의 부정이라도 의문·가정·인용 주장 문맥이면 단정하지 않는다.
    const interpretationText = directMatch ? sentence.quote.replace(/볼\s*수\s*있다/gu, '') : sentence.quote;
    const quotedClaim = !directMatch && /[‘']/u.test(sentence.quote);
    if (uncertainText(interpretationText) || quotedClaim) { held.push(sentence); continue; }
    if (config?.conflict.test(sentence.quote)) { conflicts.push(sentence); continue; }
    if (directMatch && (!requirement.context || config?.directContext?.test(sentence.quote) || requirement.context.test(text.slice(Math.max(0, sentence.start - 150), sentence.start)))) matches.push(sentence);
  }
  const contextHolds = sentences.filter(sentence => /(?:이|위|앞의)\s*(?:설명|관계|주장)[^.!?。]*(?:아니|틀|오류|거짓|가설|추측|일까|일지)/u.test(sentence.quote));
  const status = contextHolds.length ? 'INTERPRETATION_HELD' : conflicts.length ? 'EXPLICIT_CONFLICT' : held.length ? 'INTERPRETATION_HELD' : matches.length ? 'SUPPORTED' : 'NOT_CONFIRMED';
  return { id: requirement.id, text: requirement.text, status,
    evidence: status === 'SUPPORTED' ? matches : status === 'EXPLICIT_CONFLICT' ? conflicts : [...held, ...contextHolds],
    reason: status === 'SUPPORTED' ? '이 요구의 대상·작용·결과를 직접 연결한 문장입니다.' :
      status === 'EXPLICIT_CONFLICT' ? '같은 요구의 대상과 관계를 명시적으로 부정하거나 다른 원인으로 설명합니다.' :
      status === 'INTERPRETATION_HELD' ? '이 요구의 표현에 의문·추측·인용·가정 또는 앞 설명의 취소가 있어 해석을 보류합니다.' : '이 요구를 직접 설명하는 서술은 아직 확인하지 못했습니다.' };
}

module.exports = { assessRequirement, discoveryTerms, uncertainText };
