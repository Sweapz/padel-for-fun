$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$envFile = Join-Path $projectRoot 'frontend\.env'

if (Test-Path -LiteralPath $envFile) {
    $answer = Read-Host 'frontend/.env already exists. Replace it with public local Supabase settings? [y/N]'
    if ($answer -ne 'y') { Write-Host 'Existing settings kept.'; exit 0 }
}

$email = Read-Host 'Shared local account email identifier [padel-local@example.com]'
if ([string]::IsNullOrWhiteSpace($email)) { $email = 'padel-local@example.com' }
$securePassword = Read-Host 'Shared password (at least 8 characters; never saved in frontend files)' -AsSecureString
$passwordPointer = [IntPtr]::Zero
$previousOutputEncoding = $OutputEncoding

try {
    $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    $payload = @{ email = $email; password = $plainPassword } | ConvertTo-Json -Compress
    $OutputEncoding = New-Object Text.UTF8Encoding($false)
    $payload | & node.exe (Join-Path $PSScriptRoot 'setup-local.mjs')
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    if ($passwordPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer) }
    $plainPassword = $null
    $payload = $null
    $securePassword.Dispose()
    $OutputEncoding = $previousOutputEncoding
}
