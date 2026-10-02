# Development tool setup

This guide adapts agents-live's discovery, verified-download, user-local
installation and PATH-repair principles. agents-live does not provide a
Node installer to copy; its Python installer and generation manager are not
dependencies of this application.

## Discover before installing

Use a normal-user PowerShell session:

```powershell
Get-Command node.exe,npm.cmd,npx.cmd,winget,fnm,nvm,volta -All -ErrorAction SilentlyContinue
[Environment]::GetEnvironmentVariable('Path', 'User')
[Environment]::GetEnvironmentVariable('Path', 'Machine')
winget list --id OpenJS.NodeJS.LTS --exact --disable-interactivity
```

Inspect known Node locations such as `%ProgramFiles%\nodejs`,
`%LOCALAPPDATA%\Programs\nodejs` and an existing manager's configured directory.
Missing PATH is not proof of missing software. Probe a candidate's absolute
`node.exe --version` and sibling `npm.cmd --version` before adding another copy.
If fnm, nvm or Volta owns Node, use that manager to select Node 24; do not layer
an MSI or portable installation over it.

Node 24 LTS is the development/CI recommendation. The minimum in `package.json`
is 22.12. npm comes with Node; `package-lock.json` makes npm the dependency owner.

## User-local Windows installation

Use the native WinGet portable package to avoid administrator access and
PowerShell script-policy changes:

```powershell
winget install --id OpenJS.NodeJS.LTS --exact --source winget --version 24.19.0 --installer-type zip --scope user --accept-package-agreements --accept-source-agreements --disable-interactivity
if ($LASTEXITCODE -ne 0) { throw 'Node installation failed.' }
```

WinGet downloads the official Node **24.19.0** ZIP from `nodejs.org`, verifies
its manifest SHA-256, extracts into its user-owned versioned package directory,
and exposes Node/npm/npx through user PATH. The
[WinGet manifest](https://github.com/microsoft/winget-pkgs/tree/master/manifests/o/OpenJS/NodeJS/LTS/24.19.0)
contains the supported architecture-specific ZIPs. Do not force an x64 binary
onto an ARM64 host or disable download verification.

Restart the terminal/app, or repair this process's inherited PATH:

```powershell
$nodeBin = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.19.0-win-x64'
if (-not (Test-Path (Join-Path $nodeBin 'node.exe'))) {
    throw 'Locate the installed Node directory; do not assume the x64 example matches this host.'
}
$env:Path = "$nodeBin;$env:Path"
Get-Command node.exe,npm.cmd,npx.cmd | Select-Object Name,Source
node.exe --version
npm.cmd --version
npx.cmd --version
```

The x64 portable route was used for this project's Windows setup on October 2,
2026: Node **24.19.0**, npm/npx **11.17.0**. A local `.ps1` installer was blocked
by the host's policy, so native WinGet was used without changing that policy.
This records one verified setup, not a requirement to recreate its absolute path
on every machine. Preserve existing PATH entries and keep installation ownership
with WinGet; do not also unpack another unmanaged copy.

Existing terminals and long-lived apps can retain their original PATH.
Each CLI tool call can start a fresh process inheriting that old app environment;
use the process-only PATH prefix in that call, an absolute tool path, or restart the
app. Do not assume one tool call's `$env:Path` survives into the next.
Never use `setx PATH "$env:PATH;..."`, overwrite machine PATH, disable TLS
verification or relax execution policy globally. Use `npm.cmd` and `npx.cmd`
explicitly in PowerShell instead of relying on blocked `.ps1` shims.

As an alternative, if a conventional machine-scope installation is preferred:

```powershell
winget install --id OpenJS.NodeJS.LTS --exact --source winget --version 24.19.0 --installer-type wix
```

This MSI may require UAC. Choose one installation owner, not both routes;
`--scope user` is not a promised option for the MSI.

## Restore and run the application

```powershell
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'Dependency restore failed.' }
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
# Edit the local .env with public app/tenant configuration.
npm.cmd start
```

Before copying, check whether `.env` already exists and preserve it.
Keep it untracked; all `VITE_` values are
public build-time data, not credentials. Use [development](development.md) and
[testing](testing.md) for existing build/test commands.

For native commands, check `$LASTEXITCODE` before running a dependent step;
PowerShell 5 does not make every nonzero native exit a terminating exception.
Keep Node setup, PATH repair and dependent npm commands in the same tool call
when a process-local PATH update is needed.

## Optional tooling and hosting

### GitHub CLI for repository and protected release operations

Discover the executable and its installation owner before installing:

```powershell
Get-Command gh.exe -All -ErrorAction SilentlyContinue
winget list --id GitHub.cli --exact --disable-interactivity
winget show --id GitHub.cli --exact --source winget --disable-interactivity
```

The agent runtime can have an app-managed private `gh.exe` while an ordinary
terminal has no GitHub CLI installation. Do not add that private app directory
to persistent PATH or assume the runtime's command/authentication exists in
the user's terminal.

On October 2, 2026 the official WinGet MSI installed and verified standalone
GitHub CLI **2.102.0** on this Windows host:

```powershell
winget install --id GitHub.cli --exact --source winget --version 2.102.0 --installer-type wix --accept-package-agreements --accept-source-agreements --disable-interactivity
if ($LASTEXITCODE -ne 0) { throw 'GitHub CLI installation failed.' }
$gh = Join-Path $env:ProgramFiles 'GitHub CLI\gh.exe'
if (-not (Test-Path $gh)) { throw 'Rediscover the installed GitHub CLI command.' }
& $gh --version
if ($LASTEXITCODE -ne 0) { throw 'GitHub CLI verification failed.' }
```

WinGet verifies the official installer hash. The MSI may require UAC and
registers the machine PATH; existing apps/terminal processes can retain their
old environment. Use the verified absolute command until restarting the app,
or prepend its directory only to the current process PATH.

Verify the standalone profile before login. Installation and an agent's
app-provided authentication do not sign the ordinary terminal in:

```powershell
& $gh auth status --hostname github.com
if ($LASTEXITCODE -ne 0) {
    & $gh auth login --hostname github.com --git-protocol https --web
    if ($LASTEXITCODE -ne 0) { throw 'GitHub browser authorization did not finish.' }
}
```

The user authorizes GitHub CLI directly in GitHub's browser UI. Preserve any
existing authenticated account; do not copy app-injected tokens into the
standalone credential cache. Use interactive `gh secret set` for protected
repository/environment secrets: values belong only in its hidden prompt, never
a shell command argument or conversation. See [Worker setup](worker.md) for
the actual CI credential scope and required human release approval.

### Azure CLI for the existing Entra registration

Azure CLI is needed only for authorized Entra administration, not to host this
static application. Discover `az`, `az.cmd` and the installed WinGet package
before installing another copy:

```powershell
Get-Command az,az.cmd -All -ErrorAction SilentlyContinue
winget list --id Microsoft.AzureCLI --exact --disable-interactivity
winget show --id Microsoft.AzureCLI --exact --source winget --disable-interactivity
```

On October 2, 2026 the verified official x64 WinGet MSI installed Azure CLI
**2.90.0** on this Windows host. Windows may require UAC approval:

```powershell
winget install --id Microsoft.AzureCLI --exact --source winget --version 2.90.0 --accept-package-agreements --accept-source-agreements --disable-interactivity
if ($LASTEXITCODE -ne 0) { throw 'Azure CLI installation failed.' }
$az = Join-Path $env:ProgramFiles 'Microsoft SDKs\Azure\CLI2\wbin\az.cmd'
if (-not (Test-Path $az)) { throw 'Rediscover the installed Azure CLI command.' }
& $az version --output json
if ($LASTEXITCODE -ne 0) { throw 'Azure CLI verification failed.' }
```

Use the absolute verified command until the app/terminal restarts with its
updated PATH. Do not assume the x64 MSI path applies to another architecture
or replace an existing installation owner without need.
[Microsoft's Windows installation guide](https://learn.microsoft.com/cli/azure/install-azure-cli-windows)
documents WinGet/MSI and alternative distributions.

Check the selected profile before starting another login. This check reports
only the cloud name, not personal account or subscription details:

```powershell
& $az account show --query environmentName --output tsv --only-show-errors
```

Reuse an authenticated profile when the owner authorizes its use. Do not log out,
create another profile or open a redundant browser login merely because the
application registration is not immediately found. Cached ARM authentication
does not establish Microsoft Graph access to the intended directory.

If another session owns the default profile, choose a private, task-specific
profile outside the repository and set `AZURE_CONFIG_DIR` consistently in each
fresh command process. Never read/export its token cache. Configure browser-based
login and disable the subscription chooser only in that selected task profile:

```powershell
# Set $taskAzureProfile to the private profile selected for this task.
if ([string]::IsNullOrWhiteSpace($taskAzureProfile)) { throw 'Select the task Azure profile first.' }
$env:AZURE_CONFIG_DIR = $taskAzureProfile
& $az config set core.enable_broker_on_windows=false core.login_experience_v2=off core.collect_telemetry=false extension.use_dynamic_install=no --only-show-errors --output none
if ($LASTEXITCODE -ne 0) { throw 'Task profile configuration failed.' }
# Set $targetTenantId to the authorized owning directory, not a subscription ID.
if ([string]::IsNullOrWhiteSpace($targetTenantId)) { throw 'Identify the intended directory first.' }
& $az login --tenant $targetTenantId --allow-no-subscriptions --output none
if ($LASTEXITCODE -ne 0) { throw 'Azure browser authentication failed.' }
```

The user completes password/MFA/consent directly in Microsoft's UI. Keep
account details, authorization URLs and credentials out of captured diagnostics.
An application registration belongs to a tenant, not an Azure subscription;
its directory may have no selectable subscription. Use the authorized owning
tenant for Graph operations, reusing its cached authentication where available.
Do not preserve an unrelated context unnecessarily when the owner explicitly
authorizes changing it, or infer an absent registration from a denied broad
application-list request.

Locate the registration by the dashboard's configured Application (client) ID,
not a display-name guess. An exact Graph alternate-key lookup is
`GET /v1.0/applications(appId='<client-id>')`; use Azure CLI `az rest` in the
correct tenant. Preserve existing SPA redirects, audience, delegated permissions
and Web settings when adding the authorized Web callback, then read them back.
Do not identify the owning directory by the order of an ARM tenant list or by
the current subscription. If the exact application is absent there, an exact
`servicePrincipals(appId='<client-id>')` read can identify its
`appOwnerOrganizationId`; use that directory for the application lookup.
Service-principal presence/audience is not a substitute for registration
readback or proof that the current Azure profile can administer the owning
directory. Bound token-acquisition attempts and coordinate owner authentication
when the profile no longer has usable access.
Graph generates `web.redirectUriSettings` metadata for a new redirect; validate
that metadata against the registered URI rather than ignoring a whole-object
readback mismatch. Server credentials must be bounded and transferred directly
to protected Worker secret input, never command-line values or captured output.
Installation/login does not authorize Azure resource deployment or unrelated
directory/subscription changes.

### Cloudflare and browser tools

The static app needs Node/npm for development, not a production Node server.
The optional device-code backend separately needs Node on its trusted host.
Cloudflare Worker development needs Wrangler only when working on Worker code.
[Cloudflare recommends a project-local dev dependency](https://developers.cloudflare.com/workers/wrangler/install-and-update/),
not a global install, so teammates and CI use the same version. Wrangler supports
Windows 11, supported Node LTS/current releases, macOS 13.5+ and supported Linux;
Workers execute in `workerd`, not in the host Node runtime.

When intentionally adding or updating Wrangler:

```powershell
npm.cmd install --save-dev --save-exact wrangler@latest
if ($LASTEXITCODE -ne 0) { throw 'Wrangler dependency update failed.' }
```

Review and commit the exact resolved version with `package-lock.json`.
This candidate pins **Wrangler 4.147.0**; its local CLI has been verified on the
Windows 11 / Node 24 setup described above.
For an ordinary checkout with Wrangler already declared, use `npm.cmd ci`
instead of updating it. Run the local CLI without implicit package installation:

```powershell
npm.cmd exec --no -- wrangler --version
if ($LASTEXITCODE -ne 0) { throw 'The declared local Wrangler is unavailable.' }
```

Do not infer a broken setup from the absence of a global `wrangler` command.
Bare `npx wrangler` can download the latest version when the dependency is missing;
do not use that as a reproducible setup check. Worker dev/dry-run commands must
select the intended `wrangler.jsonc`; Pages deployment is a separate workflow.
Use [Worker setup](worker.md) for the actual npm scripts, D1 schema and service
configuration rather than inventing deployment commands.

Install a browser only when the selected validation needs it:

```powershell
npx.cmd playwright install chromium
if ($LASTEXITCODE -ne 0) { throw 'Playwright browser installation failed.' }
```

Cloudflare CLI installation, account login, D1/secret provisioning and deployment
are separate approvals. Keep Worker secrets server-side and follow
[release guidance](release.md). Do not import agents-live's uv/Python runtime,
provider shim restrictions, task scheduler or Python registry configuration.
