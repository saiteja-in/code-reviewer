# Step 6 — GitHub App registration

Register a GitHub App so reviews post as a **bot** (not your personal OAuth user) and the app can clone repos for indexing (Steps 7+).

## 1. Create the app

**GitHub.com:** [Settings → Developer settings → GitHub Apps → New GitHub App](https://github.com/settings/apps/new)

**GHES (enterprise):** `https://<your-host>/settings/apps/new`

| Field | Value |
|-------|--------|
| **GitHub App name** | e.g. `aicodereview-dev` (must be unique on the instance) |
| **Homepage URL** | `http://localhost:3000` (or your deployed URL) |
| **Webhook** | Active |
| **Webhook URL** | `https://<tunnel-host>/api/webhooks/github` (see §3) |
| **Webhook secret** | Generate a long random string → save as `GITHUB_WEBHOOK_SECRET` |

Uncheck **Expire user authorization tokens** if shown (optional for server-to-server App auth).

### Repository permissions

| Permission | Access |
|------------|--------|
| **Contents** | Read-only |
| **Metadata** | Read-only |
| **Pull requests** | Read and write |
| **Checks** | Read and write |

### Subscribe to events

- [x] **Pull request**
- [x] **Push**
- [x] **Installation**
- [x] **Installation repositories**

### Where can this GitHub App be installed?

- **Any account** — easiest for dev
- Or **Only on this account** — if testing on your user/org only

Click **Create GitHub App**.

## 2. Collect credentials

After creation, on the App settings page:

1. **App ID** → `GITHUB_APP_ID` (numeric)
2. **Generate a private key** (.pem) → `GITHUB_APP_PRIVATE_KEY`
3. **Webhook secret** (from step 1) → `GITHUB_WEBHOOK_SECRET`

Optional for links/debugging:

- **Client ID / Client Secret** — only if you later add “Install App” OAuth flow in the dashboard (not required for Step 6–7)

### Put the private key in `.env`

The PEM must be a **single line** with `\n` for newlines:

```env
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----\n"
GITHUB_WEBHOOK_SECRET=your-webhook-secret-here
```

**PowerShell** — encode a downloaded `.pem` file:

```powershell
cd D:\PROJECTS\aicodereview
.\scripts\setup\encode-pem-for-env.ps1 -PemPath "C:\path\to\your-app.private-key.pem"
```

Copy the printed line into `.env`.

**OpenSSL** (Git Bash / WSL):

```bash
awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' your-app.private-key.pem
```

Wrap the output in quotes in `.env`.

## 3. Expose localhost for webhooks (local dev)

GitHub must reach your webhook. Use a tunnel:

```powershell
# Cloudflare (example)
cloudflared tunnel --url http://localhost:3000

# or ngrok
ngrok http 3000
```

Set the App **Webhook URL** to:

```
https://<tunnel-subdomain>/api/webhooks/github
```

Update it whenever the tunnel URL changes.

Also set in `.env`:

```env
NEXT_PUBLIC_APP_URL=https://<tunnel-subdomain>
```

(Or keep `http://localhost:3000` for local UI and only use the tunnel URL in the GitHub App webhook settings.)

## 4. Install the app on a test repo

1. App settings → **Install App**
2. Choose your user or org → **Only select repositories** → pick a test repo
3. Confirm install

You should see an **installation** webhook delivery in the App’s **Advanced → Recent deliveries** (after Step 8 handles the event; for Step 6, a manual “Redeliver” may 200 once the app is running).

## 5. GHES-only: API base URL

If not using github.com, add to `.env`:

```env
GITHUB_API_BASE_URL=https://nausp-aapp0001.aceins.com/api/v3
```

(Adjust host to your GHES instance; Step 7 code will read this.)

## 6. Verify Step 6

### A. Env vars present

```powershell
pnpm verify:github-app-env
```

Expected: `GitHub App env: OK`.

### B. GitHub App settings

- [ ] Webhook URL points at your tunnel + `/api/webhooks/github`
- [ ] Permissions match the table above
- [ ] Events: pull_request, push, installation, installation_repositories
- [ ] App installed on at least one test repository
- [ ] Private key generated and stored in `.env`

### C. Webhook delivery (optional now)

With `pnpm dev` and tunnel running, open App → **Advanced** → **Recent deliveries** → **Redeliver** a test ping if available. A `200` response confirms reachability (full event handling comes in Step 8).

## 7. OAuth vs App (what stays)

| Mechanism | Purpose |
|-----------|---------|
| **GitHub OAuth** (`GITHUB_CLIENT_ID/SECRET`) | Dashboard login, repo connect UI — keep |
| **GitHub App** (`GITHUB_APP_*`) | Bot reviews, check runs, repo clone for indexing — Steps 7–10 |

Both can coexist during migration.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `verify:github-app-env` fails on PEM | Ensure `BEGIN`/`END` lines and `\n` between lines; wrap in double quotes |
| Webhook 401 | `GITHUB_WEBHOOK_SECRET` must match App webhook secret exactly |
| Webhook timeout | Tunnel not running or wrong URL |
| App not visible on repo | Install App on that account/repo |

Next: **Step 7** — `github-app.ts` + live API smoke test with installation token.
