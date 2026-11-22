<#
.SYNOPSIS
  One-time setup of the Family Gym Supabase project (free tier), then writes config.js.
.EXAMPLE
  .\supabase\setup.ps1 -AccessToken sbp_xxx
  # Creates one account per profile in plans/index.json and prints each person's 6-digit PIN.
  # Re-running resets every PIN. People can change their own PIN in Settings.
.NOTES
  Create the access token at https://supabase.com/dashboard/account/tokens (short expiry) and revoke it afterwards.
  Secrets are saved with DPAPI under $SecretDir.
#>
param(
  [Parameter(Mandatory)] [string] $AccessToken,
  [string] $UserDomain = 'family-gym.invalid',  # accounts are <profile>@UserDomain; .invalid can never be a real domain
  [string] $ProjectName = 'family-gym',
  [string] $Region = 'ap-south-1',
  [string] $OrgId,
  [string] $ProjectRef,               # reuse an existing project instead of creating one
  [string] $SecretDir = "$env:USERPROFILE\Secrets\family-gym"
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$api = 'https://api.supabase.com/v1'
$H = @{ Authorization = "Bearer $AccessToken" }
function Api($method, $path, $body) {
  $p = @{ Method = $method; Uri = "$api$path"; Headers = $H }
  if ($body) { $p.Body = ($body | ConvertTo-Json -Depth 8); $p.ContentType = 'application/json' }
  Invoke-RestMethod @p
}
function New-Secret([int]$n) { -join (1..$n | ForEach-Object { [Security.Cryptography.RandomNumberGenerator]::GetInt32(0, 10) }) }
function Save-Secret($name, $value) {
  New-Item -ItemType Directory -Force $SecretDir | Out-Null
  $value | ConvertTo-SecureString -AsPlainText -Force | ConvertFrom-SecureString | Set-Content "$SecretDir\$name.dpapi"
}

if (-not $ProjectRef) {
  if (-not $OrgId) {
    $orgs = @(Api GET '/organizations')
    if ($orgs.Count -ne 1) { throw "Pass -OrgId. Orgs: $($orgs | ForEach-Object { "$($_.id) ($($_.name))" })" }
    $OrgId = $orgs[0].id
  }
  $existing = @(Api GET '/projects') | Where-Object name -eq $ProjectName
  if ($existing) { $ProjectRef = $existing[0].id; Write-Host "Reusing project $ProjectRef" }
  else {
    $dbPass = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(24)) -replace '[+/=]', 'x'
    Save-Secret 'db-password' $dbPass
    $p = Api POST '/projects' @{ name = $ProjectName; organization_id = $OrgId; region = $Region; db_pass = $dbPass }
    $ProjectRef = $p.id
    Write-Host "Created project $ProjectRef, waiting for it to be healthy…"
  }
}
for ($i = 0; $i -lt 60; $i++) {
  $st = (Api GET "/projects/$ProjectRef").status
  if ($st -eq 'ACTIVE_HEALTHY') { break }
  Write-Host "  status: $st"; Start-Sleep 10
}

Write-Host 'Applying schema…'
Api POST "/projects/$ProjectRef/database/query" @{ query = (Get-Content "$root\supabase\schema.sql" -Raw) } | Out-Null

$keys = Api GET "/projects/$ProjectRef/api-keys"
$anon = ($keys | Where-Object name -eq 'anon').api_key
$service = ($keys | Where-Object name -eq 'service_role').api_key
$url = "https://$ProjectRef.supabase.co"

Write-Host 'Locking sign-ups…'
Api PATCH "/projects/$ProjectRef/config/auth" @{ disable_signup = $true; mailer_autoconfirm = $true } | Out-Null

# One account per person. app_metadata.profile (settable only with the service key) is what row-level security checks.
$SH = @{ apikey = $service; Authorization = "Bearer $service" }
$users = (Invoke-RestMethod "$url/auth/v1/admin/users?per_page=200" -Headers $SH).users
$pins = [ordered]@{}
foreach ($p in (Get-Content "$root\plans\index.json" -Raw | ConvertFrom-Json).profiles) {
  $email = "$($p.id)@$UserDomain"; $pin = New-Secret 6
  $body = @{ email = $email; password = $pin; email_confirm = $true; app_metadata = @{ profile = $p.id } } | ConvertTo-Json
  $u = $users | Where-Object email -eq $email
  if ($u) { Invoke-RestMethod -Method PUT "$url/auth/v1/admin/users/$($u.id)" -Headers $SH -Body $body -ContentType 'application/json' | Out-Null }
  else { Invoke-RestMethod -Method POST "$url/auth/v1/admin/users" -Headers $SH -Body $body -ContentType 'application/json' | Out-Null }
  Save-Secret "pin-$($p.id)" $pin
  $pins[$p.name] = $pin
}
Save-Secret 'service-role-key' $service

@"
// Cloud sync settings. Leave supabaseUrl empty to run in demo mode (logs stay on the phone).
// The anon key is public by design; the data is protected by each person's PIN sign-in plus row-level security.
window.FG_CONFIG = {
  supabaseUrl: '$url',
  anonKey: '$anon',
  // Accounts are <profile id>@userDomain (.invalid can never be a real domain).
  userDomain: '$UserDomain',
};
"@ | Set-Content "$root\config.js" -Encoding utf8

Write-Host "`n✅ Done. Project: $url"
$pins.GetEnumerator() | ForEach-Object { Write-Host "   PIN for $($_.Key): $($_.Value)" }
Write-Host "   Secrets saved in $SecretDir. Commit config.js and add repo secrets SUPABASE_URL / SUPABASE_ANON_KEY for keep-alive."
