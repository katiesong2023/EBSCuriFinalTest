$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
try {
    Write-Host '[1/5] Windows 환경과 동봉 파일을 확인합니다.'
    if (-not [Environment]::Is64BitOperatingSystem -or $env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') {
        throw '이 실행 파일은 Windows 10/11 x64 (Intel/AMD) 전용입니다. ARM PC는 문서의 소스 실행 방법을 이용하세요.'
    }
    $node = Join-Path $root 'runtime\windows-x64\node.exe'
    $ready = Join-Path $root 'runtime\windows-x64\ready.json'
    $seed = Join-Path $root 'runtime-seed\windows-x64'
    $manifest = Get-Content -LiteralPath (Join-Path $seed 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $readyHash = if (Test-Path -LiteralPath $ready) { Get-Content -LiteralPath $ready -Raw -Encoding UTF8 | ConvertFrom-Json } else { '' }
    if ($readyHash -ne $manifest.sha256 -or -not (Test-Path -LiteralPath $ready) -or -not (Test-Path -LiteralPath $node) -or -not (Test-Path -LiteralPath (Join-Path $root 'node_modules\@huggingface\transformers\package.json'))) {
        Write-Host '최초 실행 환경을 준비합니다. 설치나 다운로드 없이 포함된 파일을 풉니다.'
        $seed = Join-Path $root 'runtime-seed\windows-x64'
        $manifest = Get-Content -LiteralPath (Join-Path $seed 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        $temporary = Join-Path ([IO.Path]::GetTempPath()) ('curi-runtime-' + [guid]::NewGuid().ToString())
        New-Item -ItemType Directory -Path $temporary | Out-Null
        try {
            $archive = Join-Path $temporary 'runtime.zip'
            $output = [IO.File]::Create($archive)
            try {
                $partNumber = 0
                foreach ($part in $manifest.parts) {
                    $partNumber++
                    Write-Host ('[2/5] 실행 환경 조각 검사: ' + $partNumber + '/' + $manifest.parts.Count)
                    if ($part.file -notmatch '^runtime\.zip\.part[0-9]{3}$') { throw '실행 환경 목록 오류' }
                    $source = Join-Path $seed $part.file
                    if ((Get-Item -LiteralPath $source).Length -ne $part.bytes -or (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant() -ne $part.sha256) { throw ('파일이 손상되었습니다: ' + $part.file) }
                    $inputFile = [IO.File]::OpenRead($source)
                    try { $inputFile.CopyTo($output) } finally { $inputFile.Dispose() }
                }
            } finally { $output.Dispose() }
            if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.sha256) { throw '실행 환경 압축 검증 실패' }
            Write-Host '[2/5] 실행 환경 압축을 풀고 있습니다. PC에 따라 몇 분 걸릴 수 있습니다.'
            Expand-Archive -LiteralPath $archive -DestinationPath $root -Force
            $manifest.sha256 | ConvertTo-Json | Set-Content -LiteralPath $ready -Encoding UTF8
        } finally { Remove-Item -LiteralPath $temporary -Force -Recurse }
    }
    # 실제 비밀 설정 파일을 읽지 않고 유료 API 비활성 상태로 시작한다.
    $env:NODE_ENV = 'development'
    $env:PORT = '3000'
    $env:CURI_ALLOW_PAID_API = 'false'
    $env:HF_HUB_OFFLINE = '1'
    $env:TRANSFORMERS_OFFLINE = '1'
    Write-Host '[3/5] Windows 실행 라이브러리를 확인합니다.'
    & $node -e "if(require('./server/data/teacher-search-model-policy.json').enabled) { console.error('Paid model policy must remain disabled in this launcher.'); process.exit(2); } require('onnxruntime-node'); require('sharp');"
    if ($LASTEXITCODE -ne 0) { throw 'Windows 실행 라이브러리 로드 실패. runtime\windows-x64\vc_redist.x64.exe 설치 후 다시 실행하세요. 관리자 승인이 필요할 수 있습니다.' }
    Write-Host '[4/5] 검색 데이터와 모델을 준비합니다.'
    & $node (Join-Path $root 'server\prepare-submission.js')
    if ($LASTEXITCODE -ne 0) { throw '데이터 또는 모델 준비 실패. 위 메시지를 확인하세요.' }
    $listener = Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue
    if ($listener) { throw '3000번 포트가 사용 중입니다. 기존 Curi 실행 창을 닫은 후 다시 실행하세요.' }
    Write-Host '[5/5] 서버를 시작합니다.'
    Write-Host 'Chrome에서 http://localhost:3000 을 여세요. 이 창을 닫으면 서버가 종료됩니다.'
    & $node (Join-Path $root 'server\server.js')
    if ($LASTEXITCODE -ne 0) { throw '서버 실행 실패. 위 메시지를 확인하세요.' }
} catch {
    Write-Host ('실행 실패: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
