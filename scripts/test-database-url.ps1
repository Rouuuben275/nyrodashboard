$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'database-url.ps1')
# All values below are synthetic; no real connection or migration is attempted.
$fixture = 'postgresql://test:example@ep-test.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
$accepted = @($fixture, "  $fixture  ", "'$fixture'", ('"' + $fixture + '"'), "psql '$fixture'", ('psql "' + $fixture + '"'),
    ('DATABASE_URL=' + $fixture), ('DATABASE_URL="' + $fixture + '"'), ("export DATABASE_URL='" + $fixture + "'"),
    ('$env:DATABASE_URL = ''' + $fixture + ''''), ([string][char]0xFEFF + $fixture + [char]0x200B),
    ([string][char]0x2018 + $fixture + [char]0x2019), ([string][char]0x201C + $fixture + [char]0x201D),
    ("`r`n" + $fixture + "`r`n"))
foreach ($inputValue in $accepted) {
    if ((ConvertTo-RPilotDatabaseUrl $inputValue) -cne $fixture) { throw 'Normalization failed (fixture withheld).' }
}
$rejected = @('', '*', '****************', 'https://console.neon.tech', ('OTHER_URL=' + $fixture), ('psql ''' + $fixture + '''; Write-Host unsafe'), 'postgresql://test:example@localhost:51214/neondb', 'postgresql://test:example@127.0.0.1/neondb', 'postgresql://test:example@[::1]/neondb', 'postgresql://test:example@0.0.0.0/neondb', 'postgresql://test:example@remote.example/', 'postgresql://test:example@remote.example/neon db',
    ('DATABASE_URL="' + $fixture + '"; Write-Host unsafe'), ("DATABASE_URL='" + $fixture + "'`nOTHER_SECRET=synthetic"),
    ('postgresql://' + [char]0x200B + 'test:example@remote.example/neondb'), ([string][char]0x1B + '[200~' + $fixture))
foreach ($inputValue in $rejected) {
    $failed = $false
    try { $null = ConvertTo-RPilotDatabaseUrl $inputValue } catch {
        $failed = $true
        if ($inputValue.Length -gt 3 -and $_.Exception.Message.Contains($inputValue)) { throw 'Validation exposed an input.' }
    }
    if (-not $failed) { throw 'Unsafe or malformed fixture accepted.' }
}
# Mock clipboard and confirmation. Never inspect the operator's real clipboard.
$script:rpilotFixtureClipboard = $fixture
$script:rpilotClipboardReads = 0
function Get-Clipboard { param([switch]$Raw, [string]$ErrorAction) $script:rpilotClipboardReads++; return $script:rpilotFixtureClipboard }
function Read-Host { param([string]$Prompt, [switch]$AsSecureString) return '' }
$secureFixture = Read-RPilotProductionDatabase -FromClipboard
try {
    if ([System.Net.NetworkCredential]::new('', $secureFixture).Password -cne $fixture -or $script:rpilotClipboardReads -ne 1) { throw 'Clipboard fixture failed.' }
} finally { $secureFixture.Dispose() }
$script:rpilotFixtureClipboard = 'not-a-connection'
$clipboardRejected = $false
try { $null = Read-RPilotProductionDatabase -FromClipboard } catch { $clipboardRejected = $true }
if (-not $clipboardRejected) { throw 'Invalid clipboard fixture accepted.' }
# URI-valid password punctuation must remain byte-for-byte unchanged.
$passwordCases = @('postgresql://test:ex%40mple%23%2F%3F@remote.example/neondb?sslmode=require', "postgresql://test:ex'ample@remote.example/neondb", 'postgresql://test:ex***ample@remote.example/neondb')
foreach ($inputValue in $passwordCases) {
    if ((ConvertTo-RPilotDatabaseUrl $inputValue) -cne $inputValue) { throw 'Password punctuation was modified (fixture withheld).' }
}
Write-Host ('Database URL validation: {0} accepted formats, {1} rejected inputs, {2} password-preservation checks, 2 mocked clipboard checks; no real clipboard access, network or migration.' -f $accepted.Count, $rejected.Count, $passwordCases.Count)
