const fs = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline');
const { Writable } = require('node:stream');
const { parseEnv } = require('node:util');

function updateEnv(text, password, production = false) {
  const current = parseEnv(text);
  const minimum = production || current.NODE_ENV === 'production' ? 32 : 8;
  if (password.length < minimum) throw new Error(`비밀번호를 ${minimum}자 이상 입력해 주세요.`);
  if (/[\r\n\0]/.test(password)) throw new Error('줄바꿈이나 제어 문자는 사용할 수 없습니다.');
  const quote = ["'", '"', '`'].find(value => !password.includes(value));
  if (!quote) throw new Error('작은따옴표·큰따옴표·백틱을 모두 함께 포함하지 않도록 입력해 주세요.');
  const assignment = `CURI_ADMIN_TOKEN=${quote}${password}${quote}`;
  const pattern = /^[\t ]*(?:export[\t ]+)?CURI_ADMIN_TOKEN[\t ]*=[\t ]*(?:'[^']*'|"[^"]*"|`[^`]*`|[^\r\n]*)[^\r\n]*/gm;
  const exists = pattern.test(text);
  pattern.lastIndex = 0;
  const next = exists ? text.replace(pattern, () => assignment) : text + (text && !text.endsWith('\n') ? '\n' : '') + assignment + '\n';
  const parsed = parseEnv(next);
  if (parsed.CURI_ADMIN_TOKEN !== password || Object.keys(current).some(key => key !== 'CURI_ADMIN_TOKEN' && current[key] !== parsed[key])) {
    throw new Error('.env 형식을 보존할 수 없어 변경하지 않았습니다. 파일 형식을 확인해 주세요.');
  }
  return next;
}

function askHidden(prompt, input = process.stdin, output = process.stdout) {
  return new Promise((resolve, reject) => {
    output.write(prompt);
    // readline의 입력 반향과 다시 그리기를 출력하지 않는다.
    const silent = new Writable({ write(_chunk, _encoding, done) { done(); } });
    const rl = readline.createInterface({ input, output:silent, terminal:true, historySize:0 });
    let answered = false;
    rl.on('SIGINT', () => { rl.close(); });
    rl.on('close', () => { if (!answered) { output.write('\n'); reject(new Error('변경을 취소했습니다.')); } });
    rl.question('', value => { answered = true; rl.close(); output.write('\n'); resolve(value); });
  });
}

async function savePassword(file, password, production = false) {
  let before = null;
  try { before = await fs.readFile(file, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const next = updateEnv(before || '', password, production);
  const temporary = file + `.password-${process.pid}.tmp`;
  try {
    await fs.writeFile(temporary, next, { encoding:'utf8', mode:0o600, flag:'wx' });
    let latest = null;
    try { latest = await fs.readFile(file, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (latest !== before) throw new Error('.env가 다른 곳에서 변경되었습니다. 다시 실행해 주세요.');
    await fs.rename(temporary, file);
  } finally { await fs.rm(temporary, { force:true }); }
}

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('터미널에서 npm run admin:password를 직접 실행해 주세요.');
  const password = await askHidden('새 관리자 비밀번호 (로컬 8자 이상): ');
  const confirmation = await askHidden('비밀번호 다시 입력: ');
  if (password !== confirmation) throw new Error('비밀번호가 일치하지 않아 변경하지 않았습니다.');
  await savePassword(path.join(__dirname, '..', '.env'), password, process.env.NODE_ENV === 'production');
  console.log('관리자 비밀번호를 .env에 저장했습니다. 서버를 재시작하면 적용됩니다.');
}
if (require.main === module) main().catch(error => { console.error(error.code ? '설정 파일을 저장하지 못했습니다. 파일 권한과 실행 경로를 확인해 주세요.' : error.message); process.exitCode = 1; });
module.exports = { updateEnv, askHidden, savePassword };
