const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const fields = ['verifiedAssets', 'verifiedAssetHistory', 'mappingRuns', 'contentCurriculumMaps', 'searchProjection', 'relationReviews'];
function approvalState(store) {
  return structuredClone(Object.fromEntries(fields.map(field => [field, store[field]])));
}
function assertApprovalStateUnchanged(store, before) {
  assert.deepEqual(approvalState(store), before, '실행 전후 승인·취소 이력·검색 투영 exact 보존');
}
function checkOperationalWithdrawals(store) {
  const withdrawal = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/r09-01-approval-revocation.json'), 'utf8'));
  assert.equal(store.verifiedAssets.length, withdrawal.currentHumanApproved, '사용자가 승인 취소한 현재 운영 상태');
  assert.equal(store.searchProjection.length, withdrawal.currentApprovedSearchProjection, '승인 검색 투영의 취소 상태');
  for (const cancelled of withdrawal.cancelled) {
    assert.ok(!store.verifiedAssets.some(asset => asset.verifiedAssetId === cancelled.verifiedAssetId), '취소한 승인 복구 금지');
    assert.ok(store.verifiedAssetHistory.some(asset => asset.verifiedAssetId === cancelled.verifiedAssetId), '과거 승인 이력 보존');
    const run = store.mappingRuns.find(item => item.mappingRunId === cancelled.mappingRunId);
    const review = run?.reviewHistory?.find(item => item.reviewId === cancelled.cancellationReviewId);
    assert.equal(review?.decision, 'exclude');
    assert.equal(review?.status, cancelled.status);
    assert.equal(review?.reviewedAt, cancelled.cancelledAt);
  }
  return { currentHumanApproved: store.verifiedAssets.length, currentApprovedSearchProjection: store.searchProjection.length,
    preservedWithdrawals: withdrawal.cancelled.length, source: 'docs/r09-01-approval-revocation.json' };
}
module.exports = { approvalState, assertApprovalStateUnchanged, checkOperationalWithdrawals };
