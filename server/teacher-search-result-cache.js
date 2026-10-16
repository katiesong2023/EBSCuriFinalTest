// 모델 원문 검사를 통과한 같은 질문은 필터·정렬에서도 다시 실행하지 않는다.
function createTeacherSearchResultCache({ limit = 16, ttlMs = 300000, now = Date.now } = {}) {
  const catalogs = new WeakMap();
  return {
    async run(catalog, key, operation) {
      let entries = catalogs.get(catalog);
      if (!entries) { entries = new Map(); catalogs.set(catalog, entries); }
      let entry = entries.get(key);
      if (entry && now() - entry.createdAt >= ttlMs) { entries.delete(key); entry = null; }
      if (entry) {
        entries.delete(key); entries.set(key, entry);
        const result = await entry.promise;
        return { ...structuredClone(result), paidCalls: 0, resultCacheHit: true };
      }
      entry = { createdAt: now() };
      entry.promise = Promise.resolve().then(operation);
      entries.set(key, entry);
      while (entries.size > limit) entries.delete(entries.keys().next().value);
      try {
        const result = await entry.promise;
        // 일시적 모델·색인 실패와 미완료 판정은 다음 요청에서 재시도한다.
        if (!result.review?.accepted && entries.get(key) === entry) entries.delete(key);
        return structuredClone(result);
      } catch (error) {
        if (entries.get(key) === entry) entries.delete(key);
        throw error;
      }
    }
  };
}

module.exports = { createTeacherSearchResultCache };
