const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const serviceName = "EBS_CURI_OPENAI_API_KEY";
const accountName = "curimap-local";
const keychainReadTimeoutMs = 30000;

class KeychainApiKeyError extends Error {
  constructor(message) {
    super(message);
    this.code = "API_KEY_UNAVAILABLE";
  }
}

async function getOpenAiApiKey() {
  try {
    const { stdout } = await execFileAsync(
      "/usr/bin/security",
      ["find-generic-password", "-s", serviceName, "-a", accountName, "-w"],
      { encoding: "utf8", maxBuffer: 4096, timeout: keychainReadTimeoutMs }
    );
    const apiKey = stdout.trim();

    if (!apiKey) {
      throw new KeychainApiKeyError("macOS 키체인 API 키 항목이 비어 있습니다.");
    }

    return apiKey;
  } catch (error) {
    if (error instanceof KeychainApiKeyError) {
      throw error;
    }

    // 키체인 명령의 상세 출력에는 비밀값이 포함될 수 있어 화면이나 로그로 전달하지 않는다.
    throw new KeychainApiKeyError(
      "macOS 키체인에서 CuriMap API 키를 읽지 못했습니다. 키체인 접근 권한을 허용한 뒤 다시 시도하세요."
    );
  }
}

module.exports = {
  KeychainApiKeyError,
  getOpenAiApiKey
};
