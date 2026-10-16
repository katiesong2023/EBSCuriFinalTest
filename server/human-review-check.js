const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { createHumanReviewService } = require("./human-review");
const { readDataStore } = require("./data-store");
const { reconcileVerifiedAssets, evaluateVerification, verifiedPayload, fingerprint } = require("./data-quality");
const { loadEvidenceContext } = require("./automatic-evidence-service");
const { createAutomaticEvidence } = require("./automatic-evidence");
const { validateAsset } = require("./automatic-asset-validity");
const { createAutomaticAssetService } = require("./automatic-assets");
const { fixture: legacyFixture } = require("./verified-save-check");
const { relationKey } = require("./human-review-contract");
const { openAssetStore } = require("./automatic-asset-store");
const cases = [], check = async (name, fn) => { await fn(); cases.push({ name, passed: true }); };
const hashes = async () => Object.fromEntries(await Promise.all(["curi-store.json", "broadcast-catalog.sqlite", "semantic-layer.sqlite", "automatic-assets.sqlite"].map(async (name) => [name, crypto.createHash("sha256").update(await fs.readFile(path.join(__dirname, "data", name))).digest("hex")])));
async function main() {
  const before = await hashes(), original = await readDataStore(), temporary = await fs.mkdtemp(path.join(os.tmpdir(), "curi-human-check-"));
  const initial = structuredClone(original), content = structuredClone(initial.contents[0]);
  content.curiId = "HUMAN-TEST-CONTENT"; content.sourceIdentity = { sourceSystem: "EBS_TEST", sourceContentId: "HUMAN-TEST-RESOURCE" };
  Object.assign(content.metadata, { title: "합성 지구의 자전", synopsis: "지구는 자전한다. 지구의 자전 때문에 낮과 밤이 생긴다.", subjectSeed: "과학", gradeBandSeed: "5~6학년군", contentLevel: "episode", variant: "EPISODE" });
  content.source.sourceUrl = "https://www.ebs.co.kr/test"; content.provenance.descriptionSourceUrl = content.source.sourceUrl;
  initial.contents.push(content);
  let store = structuredClone(initial), writes = 0, preparations = 0, failWrite = false, failSearch = false, blockedRead;
  const readStore = async () => { if (blockedRead) await blockedRead; return reconcileVerifiedAssets(structuredClone(store)); };
  const service = createHumanReviewService({ readStore, filename: path.join(temporary, "automatic.sqlite"),
    writeStore: async (value) => { if (failWrite) throw new Error("합성 원자 교체 실패"); store = structuredClone(reconcileVerifiedAssets(value)); writes++; },
    prepare: async () => { preparations++; if (failSearch) throw new Error("합성 검색 실패"); return { state: "READY" }; } });
  const target = { contentCuriId: content.curiId }, standard = "CURI-CURR-2022-6과12-02", sibling = "CURI-CURR-2022-6과12-01";
  const request = async (id = standard, decision = "edit") => {
    const view = await service.workspace({ ...target, subject: "과학", standardId: id }), relation = view.relations.find((item) => item.curriculumCuriId === id);
    return { target, subject: "과학", curriculumCuriId: id, expectedVersion: relation.expectedVersion, requestId: crypto.randomUUID(),
      decision, confirmed: true, reasonCode: "REVIEWED", note: "합성 기능 시험의 사람 입력 모사 · 실제 교육과정 평가 아님",
      changes: decision === "edit" ? { quote: { field: "synopsis", start: 0, end: content.metadata.synopsis.length, quote: content.metadata.synopsis },
        rationale: "합성 자전 설명 관계", teachingUse: "합성 관찰 활동", coreConcepts: ["자전"], connectedParts: "자전과 낮·밤 설명", unconfirmedParts: "실제 영상과 학생 성취 미확인", coverage: "PARTIAL" } : {} };
  };
  try {
    await check("미저장 후보·기존 초안 없이 공식 관계와 현재 근거를 읽기 전용 조회", async () => { const view = await service.workspace({ ...target, subject: "과학" }); assert.ok(view.relations.some((item) => item.curriculumCuriId === standard)); assert.equal(writes, 0); });
    await check("실제 확인 누락·행위자/통과 플래그 주입·가짜 코드·인용 위치 변조 차단", async () => {
      for (const changes of [{ confirmed: false }, { reviewerRole: "AI" }, { expectedVersion: "bad" }, { curriculumCuriId: "FAKE" }, { changes: { quote: { field: "synopsis", start: 0, end: 4, quote: "없는인용" } } }]) await assert.rejects(service.save({ ...await request(), ...changes }));
      assert.equal(writes, 0);
    });
    let first, firstRequest;
    await check("한 결정으로 해당 관계 이력·승인 자산 저장과 검색 준비", async () => { firstRequest = await request(); first = await service.save(firstRequest); assert.equal(first.saved, true); assert.equal(first.searchPreparation.state, "READY"); assert.equal(store.relationReviews.length, 1); assert.equal(store.verifiedAssets.length, 5); assert.equal(writes, 1); });
    await check("응답 유실 재시도·요청 ID 재사용 변조·오래된 화면 충돌", async () => {
      const repeated = await service.save(firstRequest); assert.equal(repeated.review.reviewId, first.review.reviewId); assert.equal(repeated.reused, true); assert.equal(writes, 1);
      await assert.rejects(service.save({ ...firstRequest, note: "다른 결정" }), (error) => error.statusCode === 409);
      await assert.rejects(service.save({ ...firstRequest, requestId: crypto.randomUUID() }), (error) => error.statusCode === 409);
    });
    let siblingAsset;
    await check("서로 다른 기준 관계 독립 승인·부분 수정·원래 승인4개 보존", async () => {
      await service.save(await request(sibling)); siblingAsset = structuredClone(store.verifiedAssets.find((asset) => asset.curriculumCuriId === sibling && asset.contentCuriId === content.curiId));
      const input = await request(); input.changes = { rationale: "해당 관계만 수정" }; await service.save(input);
      assert.deepEqual(store.verifiedAssets.find((asset) => asset.verifiedAssetId === siblingAsset.verifiedAssetId), siblingAsset);
      assert.deepEqual(store.verifiedAssets.filter((asset) => asset.contentCuriId !== content.curiId), original.verifiedAssets);
    });
    await check("사람 승인 채택은 수정 없는 설명에만 허용", async () => {
      const input = await request(standard, "approve"); await service.save(input);
      await assert.rejects(service.save({ ...await request(standard, "approve"), changes: { rationale: "바꾼 설명" } }), /수정/);
    });
    await check("한 관계 제외·보류는 형제 보존·주제 원문 유지·자동 재공개 차단", async () => {
      for (const decision of ["exclude", "hold"]) {
        const result = await service.save(await request(standard, decision)); assert.ok(!store.verifiedAssets.some((asset) => asset.contentCuriId === content.curiId && asset.curriculumCuriId === standard));
        assert.ok(store.verifiedAssets.some((asset) => asset.verifiedAssetId === siblingAsset.verifiedAssetId));
        const context = await loadEvidenceContext({ ...target, subject: "과학" }, store, []), report = createAutomaticEvidence(context.resource, context.standards, context.options);
        assert.equal(validateAsset(report.relations.find((relation) => relation.standard.curriculumCuriId === standard), context).reason, `HUMAN_${decision.toUpperCase()}`);
        assert.equal(result.review.decision, decision); assert.equal(store.contents.find((item) => item.curiId === content.curiId).lifecycle.isActive, true);
      }
    });
    await check("동시 요청은 덮어쓰기 없이 409·원자 쓰기 실패는 결정과 자산 모두 미반영", async () => {
      const input = await request(), snapshot = JSON.stringify(store); failWrite = true;
      await assert.rejects(service.save(input), /원자 교체/); assert.equal(JSON.stringify(store), snapshot); failWrite = false;
      let release; blockedRead = new Promise((resolve) => { release = resolve; }); const saving = service.save(input);
      await assert.rejects(service.save({ ...input, requestId: crypto.randomUUID() }), (error) => error.statusCode === 409);
      blockedRead = null; release(); await saving; assert.equal(store.relationReviews.filter((review) => review.requestId === input.requestId).length, 1);
    });
    await check("검색 실패는 결정·자산 유지·검색 단독 재시도에 재승인 없음", async () => {
      failSearch = true; const saved = await service.save(await request()), count = store.relationReviews.length, writeCount = writes;
      assert.equal(saved.searchPreparation.state, "FAILED"); assert.ok(store.verifiedAssets.some((asset) => asset.reviewId === saved.review.reviewId));
      failSearch = false; assert.equal((await service.retry({ reviewId: saved.review.reviewId })).searchPreparation.state, "READY"); assert.equal(store.relationReviews.length, count); assert.equal(writes, writeCount);
    });
    await check("특정 기준 변경은 그 관계만 무효화·오래된 기준 화면 저장 차단", async () => {
      const input = await request(), changed = store.curriculumStandards.find((item) => item.curiId === standard); changed.metadata.achievementStandard += " 변경";
      const current = await readStore(); assert.ok(!current.verifiedAssets.some((asset) => asset.contentCuriId === content.curiId && asset.curriculumCuriId === standard));
      assert.ok(current.verifiedAssets.some((asset) => asset.verifiedAssetId === siblingAsset.verifiedAssetId));
      await assert.rejects(service.save(input), (error) => error.statusCode === 409); changed.metadata.achievementStandard = initial.curriculumStandards.find((item) => item.curiId === standard).metadata.achievementStandard;
    });
    await check("원문 변경은 공유 관계 재확인·오래된 원문 화면 저장 차단", async () => {
      const input = await request(); store.contents.find((item) => item.curiId === content.curiId).metadata.synopsis += " 원문 변경";
      assert.ok(!(await readStore()).verifiedAssets.some((asset) => asset.contentCuriId === content.curiId));
      await assert.rejects(service.save(input), (error) => error.statusCode === 409);
      store.contents.find((item) => item.curiId === content.curiId).metadata.synopsis = content.metadata.synopsis;
    });
    await check("공식 기준 삭제 뒤 판단 이력은 보존·새 승인 차단", async () => {
      const index = store.curriculumStandards.findIndex((item) => item.curiId === standard), [removed] = store.curriculumStandards.splice(index, 1);
      const view = await service.workspace({ ...target, subject: "과학" });
      assert.ok(!view.relations.some((item) => item.curriculumCuriId === standard));
      assert.ok(view.archived.some((item) => item.curriculumCuriId === standard && item.history.length && item.invalidReason === "STANDARD_CHANGED"));
      store.curriculumStandards.splice(index, 0, removed);
    });
    await check("짧은 제목만 있는 원문으로 새 승인 자산 생성 차단", async () => {
      const current = store.contents.find((item) => item.curiId === content.curiId), previous = structuredClone(current.metadata);
      Object.assign(current.metadata, { title: "자전", synopsis: "짧은원문" });
      const input = await request(); input.changes.quote = { field: "synopsis", start: 0, end: 4, quote: "짧은원문" };
      await assert.rejects(service.save(input), (error) => error.statusCode === 409);
      current.metadata = previous;
    });
    await check("자동 실행·규칙 버전은 유효 사람 승인 근거와 분리", async () => {
      const snapshot = JSON.stringify((await readStore()).verifiedAssets), auto = createAutomaticAssetService({ filename: path.join(temporary, "automatic.sqlite"), loadContext: (input) => loadEvidenceContext(input, store, []) });
      await auto.process({ ...target, subject: "과학" }); assert.equal(JSON.stringify((await readStore()).verifiedAssets), snapshot);
      const db = openAssetStore(path.join(temporary, "automatic.sqlite"));
      db.exec("UPDATE relations SET evidence=json_set(evidence,'$.ruleVersion','changed-rule'); UPDATE runs SET report=json_set(report,'$.scope.version','changed-rule') WHERE report IS NOT NULL;"); db.close();
      assert.equal(JSON.stringify((await readStore()).verifiedAssets), snapshot);
    });
    await check("기존 묶음 승인 두 관계 중 하나만 변경·원래 시각/행위자·나머지 관계 보존", () => {
      const legacy = legacyFixture(), gate = evaluateVerification(legacy, "content-1");
      legacy.verifiedAssets = gate.maps.map((map, index) => { const payload = verifiedPayload(gate, index); return { ...payload, verifiedAssetId: `asset-${index}`, evidenceFingerprint: fingerprint(payload) }; });
      const sibling = structuredClone(legacy.verifiedAssets[1]);
      legacy.curriculumStandards[0].metadata.achievementStandard = "첫 기준 변경"; reconcileVerifiedAssets(legacy);
      assert.equal(legacy.verifiedAssets.length, 1); assert.deepEqual(legacy.verifiedAssets[0], sibling); assert.equal(legacy.mappingRuns[0].reviewHistory.length, 1);
    });
    await check("기존 실제 초안/묶음 기록은 읽기 참조·명시적 관계 판단만 새 자산 생성", async () => {
      let legacy = structuredClone(original), count = 0;
      const service = createHumanReviewService({ filename: path.join(temporary, "empty.sqlite"), readStore: async () => reconcileVerifiedAssets(structuredClone(legacy)),
        writeStore: async (value) => { legacy = reconcileVerifiedAssets(structuredClone(value)); count++; }, prepare: async () => ({ state: "READY" }) });
      const asset = original.verifiedAssets[0], target = { contentCuriId: asset.contentCuriId };
      const view = await service.workspace(target), relation = view.relations.find((item) => item.curriculumCuriId === asset.curriculumCuriId);
      assert.equal(relation.reference.kind, "DRAFT"); assert.ok(relation.fields.draftText); assert.equal(count, 0);
      assert.equal(relation.legacyReviews.at(-1).reviewedAt, asset.review.reviewedAt);
      await service.save({ target, subject: view.subject, curriculumCuriId: relation.curriculumCuriId, expectedVersion: relation.expectedVersion,
        requestId: crypto.randomUUID(), decision: "approve", confirmed: true, reasonCode: "REVIEWED", note: "복제본의 호환 기능 시험 · 실제 새 사람 평가 아님", changes: {} });
      assert.equal(legacy.verifiedAssets.length, 4); assert.equal(legacy.relationReviews.length, 1); assert.deepEqual(legacy.mappingRuns, original.mappingRuns);
      assert.deepEqual(legacy.verifiedAssets.filter((item) => item.contentCuriId !== asset.contentCuriId), original.verifiedAssets.filter((item) => item.contentCuriId !== asset.contentCuriId));
      legacy.mappingRuns.find((run) => run.mappingRunId === relation.reference.id).result.teachingUse += " 초안 변경";
      reconcileVerifiedAssets(legacy);
      assert.ok(!legacy.verifiedAssets.some((item) => item.reviewKind === "RELATION_REVIEW"));
    });
    await check("동일 제목·다른 판본/공식 기준으로 사람 결정 전파 없음", () => {
      const source = first.review.source;
      assert.notEqual(relationKey(source, standard), relationKey({ ...source, variant: "OTHER" }, standard));
      assert.notEqual(relationKey(source, standard), relationKey({ ...source, sourceContentId: "OTHER" }, standard));
      assert.notEqual(relationKey(source, standard), relationKey(source, sibling));
    });
    await check("실제 승인4개·검토 이력·원본4저장소 해시 보존", async () => { assert.deepEqual(await hashes(), before); assert.equal((await readDataStore()).verifiedAssets.length, 4); });
    await fs.writeFile("docs/r08-04-human-check.json", JSON.stringify({ date: new Date().toISOString(), cases, protectedHashes: before, paidApiCalls: 0,
      fixture: "임시 저장소·합성 기능 시험의 사람 입력 모사. 실제 사람 교육과정 평가/승인 수행 아님" }, null, 2) + "\n");
    console.log(`R08-04 관계 결정·통합 저장 ${cases.length}개 통과`);
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
