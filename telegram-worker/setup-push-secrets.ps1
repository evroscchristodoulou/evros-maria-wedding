# Run on your own Windows computer from the telegram-worker folder.
# Requirements: Node.js, npm and access to your Cloudflare account.
# Never commit VAPID keys or your administrator passcode to GitHub.
$ErrorActionPreference = "Stop"
if (-not (Get-Command npx -ErrorAction SilentlyContinue)) { throw "Install Node.js first: https://nodejs.org" }
Write-Host "Sign in to Cloudflare in the browser if prompted."
npx --yes wrangler login
if ($LASTEXITCODE -ne 0) { throw "Cloudflare login failed" }
Write-Host "Generating a new matching VAPID key pair..."
$raw = npx --yes --package web-push web-push generate-vapid-keys --json
if ($LASTEXITCODE -ne 0) { throw "Could not generate VAPID keys" }
$keys = ($raw | Out-String | ConvertFrom-Json)
if (-not $keys.publicKey -or -not $keys.privateKey) { throw "VAPID key generation returned invalid output" }
$pass = Read-Host "Choose a LONG private administrator passcode (at least 20 characters)"
if ($pass.Length -lt 20) { throw "Passcode too short" }
$keys.publicKey | npx --yes wrangler secret put VAPID_PUBLIC_KEY
if ($LASTEXITCODE -ne 0) { throw "Could not save public key" }
$keys.privateKey | npx --yes wrangler secret put VAPID_PRIVATE_KEY
if ($LASTEXITCODE -ne 0) { throw "Could not save private key" }
$pass | npx --yes wrangler secret put ADMIN_SECRET
if ($LASTEXITCODE -ne 0) { throw "Could not save administrator passcode" }
Write-Host "All three secrets saved. Your private administrator passcode is the one you chose."
Write-Host "Do not lose it. Never send it to wedding guests."
