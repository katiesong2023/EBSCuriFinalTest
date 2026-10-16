// 검색·내용 안내·후보 조회·자동 검사가 같은 품질 기준을 사용한다. 인용은 변환 전 원문 기준이다.
const qualityVersion = "source-text-v3";
const qualityLabels = { none: "소개문 없음", repeated: "제목 반복", production: "편성·제작 안내 중심", short: "짧은 내용 설명", detailed: "구체적 내용 설명" };
function comparable(value) {
  return String(value ?? "").normalize("NFKC").replace(/<[^>]*>/g, " ")
    .replace(/&(?:nbsp|amp|quot|apos|lt|gt);/g, " ").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
}
function assessSourceText(title, synopsis) {
  const contentTitle=String(title??'').replace(/^(?:\[(?:자막|수어|HD|고화질)\]|자막(?!은|을|이|의|과|와|으로|에|제작|번역|기술|정보))\s*/u,'');
  const titleKey = comparable(contentTitle), textKey = comparable(synopsis);
  const result = (category, status, code, message) => ({ category, label: qualityLabels[category], version: qualityVersion,
    rank: ["none", "repeated", "production", "short", "detailed"].indexOf(category), status, code, message,
    topicTextAvailable: Boolean(titleKey || textKey), detailedMappingAllowed: status === "PASS" });
  if (!textKey) return result("none", "HELD", "INSUFFICIENT_TEXT", "소개문이 없어 제목의 소재만 확인할 수 있습니다.");
  const withoutTitle = titleKey ? textKey.split(titleKey).join("") : textKey;
  const withoutFormat = textKey.replace(/^(?:더빙|수어|자막)/u, "");
  if (!withoutTitle || titleKey && withoutFormat === titleKey) return result("repeated", "HELD", "TITLE_REPEATED", "소개문이 제목의 반복이므로 상세 연계를 보류합니다.");
  const text = String(synopsis).replace(/<[^>]*>/g, " ").replace(/&(?:nbsp|amp|quot|apos|lt|gt);/g, " ");
  const residual = text
    .replace(/(?:본\s*방송|재방송|방송\s*시간|편성\s*안내|다시\s*보기|시청\s*(?:바랍니다|하세요|해주세요|해\s*주세요|부탁)|방영\s*(?:시간|일정)|많은\s*관심|많은\s*사랑|홈페이지|공식\s*사이트)[^.!?\n。]*(?:[.!?。]|$)/gu, " ")
    .replace(/(?:자세한|더\s*많은)\s*(?:내용|정보)[^.!?\n。]*(?:[.!?。]|$)/gu, " ")
    .replace(/(?:기존\s*)?프로그램[^.!?\n。]*(?:재구성|재편집)[^.!?\n。]*(?:[.!?。]|$)/gu, " ");
  const residualKey = titleKey ? comparable(residual).split(titleKey).join("") : comparable(residual);
  const words = new Set((residual.match(/[가-힣a-zA-Z]{2,}/gu) || [])
    .filter((word) => !/^(?:EBS|ebs|프로그램|소개|안내|영상|방송|내용|정보|입니다|합니다|있습니다)$/.test(word)));
  const minimum = residualKey.length >= 12 && words.size >= 3;
  const production = residualKey.length < withoutTitle.length * 0.35 && /방송|시청|편성|홈페이지|프로그램|제작|재구성/.test(text);
  if (production && !minimum) return result("production", "HELD", "SOURCE_TEXT_TOO_THIN", "편성·제작 안내가 중심이어서 내용 관계를 확인하기 어렵습니다.");
  if (!minimum) return result("short", "HELD", "SOURCE_TEXT_TOO_THIN", "짧은 내용 설명이 있으나 상세 연계에 필요한 최소 원문이 부족합니다.");
  const detailed = residualKey.length >= 80 && words.size >= 12;
  return result(detailed ? "detailed" : "short", "PASS", "SOURCE_DESCRIPTION_AVAILABLE",
    detailed ? "대상·사례를 비교할 길이의 설명이 있습니다. 관계 충족·영상 내용은 별도 확인합니다." : "짧은 설명이 최소 원문 조건을 통과했습니다. 관계 충족·설명 깊이는 보장하지 않습니다.");
}
function sourceQualityStats(items) {
  const distribution = Object.fromEntries(Object.keys(qualityLabels).map((key) => [key, 0]));let minimumPassed = 0;
  for (const item of items) { const quality = assessSourceText(item.title, item.summary ?? item.synopsis); distribution[quality.category]++; minimumPassed += Number(quality.detailedMappingAllowed); }
  return { version: qualityVersion, total: items.length, distribution, minimumPassed, minimumRatio: items.length ? minimumPassed / items.length : 0 };
}
module.exports = { assessSourceText, qualityLabels, qualityVersion, sourceQualityStats };
