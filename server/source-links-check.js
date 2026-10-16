const assert = require("node:assert/strict");
const { resolveSourceLink } = require("./source-links");
const { loadDiscoveryCatalog } = require("./discovery-catalog");
const { discoverContents, getDiscoveryResources } = require("./discovery-search");

async function check() {
  const catalog = await loadDiscoveryCatalog();
  const clip = catalog.resources.find((item) => item.id === "ECLIP-046");
  assert.equal(clip.navigation.status, "MATCHED");
  assert.equal(clip.navigation.label, "해당 클립 열기");
  const url = new URL(clip.navigation.url);
  assert.equal(url.searchParams.get("clipId"), "CS000000000000005150");
  assert.equal(url.searchParams.get("lectureId"), "LS0000000010296209");
  assert.equal(resolveSourceLink({ ...clip, title: "전혀 다른 제목" }).kind, "SEARCH");
  assert.equal(resolveSourceLink({ ...clip, sourceUrl: "https://ebs.co.kr/changed" }).kind, "SEARCH");
  const unrelated = resolveSourceLink({ id: "UNKNOWN", title: "<동고서저>&국토", program: "검사", sourceUrl: "javascript:alert(1)" });
  assert.equal(unrelated.label, "EBS에서 제목 검색");
  assert.equal(new URL(unrelated.url).searchParams.get("query"), "검사 <동고서저>&국토");
  const stale = new Map([[clip.id, { id: clip.id, title: clip.title, originalUrl: clip.sourceUrl, url: clip.navigation.url, kind: "CLIP", status: "UNCONFIRMED" }]]);
  assert.equal(resolveSourceLink(clip, stale).kind, "SEARCH");
  const direct = await discoverContents({ q: "동고서저", access: "direct" }, catalog);
  assert.ok(direct.results.some((item) => item.id === "ECLIP-046"));
  assert.ok(direct.results.length >= 8);
  assert.ok(direct.results.every((item) => item.navigation.status === "MATCHED" && ["CLIP", "EPISODE"].includes(item.navigation.kind)));
  const introduction = catalog.resources.find((item) => item.id === "GEO-SEORAK");
  assert.equal(introduction.navigation.kind, "EPISODE");
  assert.equal(new URL(introduction.navigation.url).searchParams.get("lectId"), "10295175");
  const gimje = catalog.resources.find((item) => item.id === "GEO-GIMJE");
  assert.equal(gimje.navigation.kind, "EPISODE");
  assert.equal(new URL(gimje.navigation.url).searchParams.get("lectId"), "3054984");
  const store = require("./data/curi-store.json");
  for (const asset of store.verifiedAssets) {
    const link = resolveSourceLink({ id: asset.content.sourceIdentity.sourceContentId, title: asset.content.metadata.title,
      program: asset.content.metadata.programName, sourceUrl: asset.content.sourceUrl });
    assert.equal(link.kind, "CLIP", asset.content.metadata.title);
    assert.equal(link.status, "MATCHED");
  }
  await assert.rejects(discoverContents({ access: "invalid" }, catalog));
  const refreshed = await getDiscoveryResources({ ids: "ECLIP-046,NOT-IN-CATALOG" });
  assert.equal(refreshed.resources.length, 1);
  assert.equal(refreshed.resources[0].navigation.url, clip.navigation.url);
  // R4에서 다른 회차로 확인된 주소는 목록 제공 상태와 무관하게 제목 검색으로 돌린다.
  const mismatch = catalog.resources.find((item) => item.id === "BCAST-b3fcf41eba96e61930d8");
  assert.ok(mismatch);
  assert.equal(mismatch.navigation.kind, "SEARCH");
  assert.notEqual(mismatch.navigation.status, "MATCHED");
  const mismatchRefresh = await getDiscoveryResources({ ids: mismatch.id });
  assert.equal(mismatchRefresh.resources[0].navigation.url, mismatch.navigation.url);
  await assert.rejects(getDiscoveryResources({ ids: "" }));
  await assert.rejects(getDiscoveryResources({ ids: Array(101).fill("ECLIP-046").join(",") }));
  console.log("source link checks passed (exact clip/episode IDs, stale title/URL, unconfirmed fallback, safe query, direct-only filter, saved-link refresh)");
}
check().catch((error) => { console.error(error); process.exitCode = 1; });
