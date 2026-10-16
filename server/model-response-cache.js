const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const stable = v => Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v;
const payloadHash = payload => crypto.createHash('sha256').update(JSON.stringify(stable(payload))).digest('hex');
function createResponseCache(directory) {
  return {
    get(payload) {
      const key = payloadHash(payload), file = path.join(directory, key + '.json');
      if (!fs.existsSync(file)) return null;
      try { const record = JSON.parse(fs.readFileSync(file, 'utf8')); return record.key === key && record.model === payload.model ? record.response : null; } catch { return null; }
    },
    put(payload, response) {
      if (response?.status !== 'completed' || response.model !== payload.model) return;
      fs.mkdirSync(directory, { recursive: true });
      const key = payloadHash(payload), file = path.join(directory, key + '.json');
      fs.writeFileSync(file + '.tmp', JSON.stringify({ key, model: payload.model, response }), { mode: 0o600 }); fs.renameSync(file + '.tmp', file);
    }
  };
}
module.exports = { createResponseCache, payloadHash };
