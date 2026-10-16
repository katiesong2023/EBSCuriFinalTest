const fs = require('node:fs'), zlib = require('node:zlib'), path = require('node:path'), crypto = require('node:crypto');
const { createResponseCache } = require('./model-response-cache');
const read = p => JSON.parse(zlib.gunzipSync(fs.readFileSync(p)));
const sha = v => crypto.createHash('sha256').update(v).digest('hex');
const root = 'docs/r12-40-anchored-', cache = createResponseCache(path.resolve(__dirname, 'data/.teacher-model-cache'));
let count = 0;
for (const [snapshotName, responsesName, model] of [['contracts', 'query', 'gpt-6-luna'], ['contracts-final', 'repair', 'gpt-6-luna'], ['contracts-strong', 'strong', 'gpt-4.1-2025-04-14'], ['candidates', 'source', 'gpt-6-luna']]) {
  const snapshot = read(root + snapshotName + '.json.gz');
  const rows = snapshot.rows;
  for (const r of fs.readFileSync(root + responsesName + '-responses.jsonl', 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)) {
    const row = rows.find(row => row.set === r.set && row.id === r.id);
    if (!row?.prepared || r.promptHash !== sha(JSON.stringify(row.prepared.payload)) || r.response.model !== model) throw Error('CACHE_PRIMING_INPUT_MISMATCH');
    cache.put({ ...row.prepared.payload, model, max_output_tokens: 4096 }, r.response); count++;
  }
}
console.log(JSON.stringify({ copiedActualResponses: count, paidCalls: 0, labelsUsed: false }));
