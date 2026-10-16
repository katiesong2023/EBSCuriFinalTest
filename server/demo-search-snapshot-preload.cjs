// 명시적 품질 실험에서만 사용한다. 같은 저장소의 병행 수정과 분리하여 읽기 전용 코드 판본을 로드한다.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const directory = process.env.CURI_EVAL_CODE_DIR;
if (!directory) throw Error('CURI_EVAL_CODE_DIR에 고정 코드 디렉터리를 지정하세요.');
const root = __dirname + path.sep;
const source = new Map(fs.readdirSync(directory).filter(name => name.endsWith('.js'))
  .map(name => [root + name, fs.readFileSync(path.join(directory, name), 'utf8')]));
globalThis.curiEvaluationCodeSnapshot = { directory, files: Object.fromEntries([...source].map(([file, text]) =>
  ['server/' + path.basename(file), crypto.createHash('sha256').update(text).digest('hex')])) };
const original = Module._extensions['.js'];
Module._extensions['.js'] = function loadSnapshot(module, filename) {
  const text = source.get(filename);
  return text === undefined ? original(module, filename) : module._compile(text, filename);
};
