# OfferLens — single-VPS production runbook (offerlens.mueens.tech)

The one-page guide to put OfferLens on the shared Ubuntu VPS behind the host nginx that
already serves other domains. For the general "what the app needs" reference see
`DEPLOYMENT.md`; this file is the ordered, copy-paste procedure for THIS server.

**Topology.** One public origin, `https://offerlens.mueens.tech`. Host nginx (ports 80/443,
already running) serves the built frontend as a static SPA and proxies `/api/` to the API
container on `127.0.0.1:8100`. All OfferLens containers (api, workers, postgres, redis) live in
their own Docker project `offerlens`, on their own bridge network, and publish nothing except
the API's loopback-only `127.0.0.1:8100`.

**Why loopback-only.** Published Docker ports BYPASS UFW on this box. UFW allows 22, 80, 443,
6001 and the coturn ports. If any OfferLens port bound to `0.0.0.0` it would be exposed to the
internet past the firewall. Every published port here binds to `127.0.0.1`.

**Server facts (as surveyed).** IPv4 `72.61.245.134`. Host nginx + host MySQL + host Redis on
`127.0.0.1:6379` + PHP-FPM + other Docker containers on `127.0.0.1:3010/3100/8000/9000` +
Postgres containers already run here. ~3.4 GB RAM free of 7.8 GB, 2 vCPU, shared with
production. A `*** System restart required ***` is pending (the owner decides when).

> Convention: every command is labelled **[laptop PowerShell]**, **[server: deploy]** (the
> non-root `deploy` user), or **[server: sudo]**. Nothing runs as root directly.

---

## 0. Prerequisites

Have all of these ready before section 1. The step that needs each one is noted.

### Accounts and access
- [ ] **SSH access to the server as the `deploy` user** (key-based), and the ability to become
      root or use `sudo` for nginx/certbot. Test: `ssh deploy@72.61.245.134` works. *(§2 on.)*
- [ ] **Namecheap access** to the `mueens.tech` domain's DNS. Confirm the domain uses Namecheap's
      own nameservers (BasicDNS); if DNS is delegated elsewhere, the A record goes there instead. *(§1.)*
- [ ] **The private repo on the laptop**, this branch checked out, clean. *(§3, §6, §7.)*
- [ ] **A Gemini API key** (Google AI Studio). Without it every analysis is canned. *(§4.)*
- [ ] **An Azure account with the Document Intelligence resource created** — see §0.1 below. *(§4.)*

### Tools on the laptop
- [ ] **Node 22.13+** and npm (`node -v`). Used to run migrations and build the frontend. *(§6, §7.)*
- [ ] **An SSH/scp client** (OpenSSH ships with Windows; `ssh`, `scp` on PATH). *(§3, §6, §7.)*
- [ ] **The repo's backend deps installed** (`cd backend; npm ci`) before §6.
- [ ] **`curl.exe`** for the smoke test (ships with Windows 10/11). *(§9.)*

### Already on the server (verified during survey — confirm in §2, do not install)
- Docker + Docker Compose v2, host nginx on 80/443, certbot. The `deploy` user and `/srv`, `/var/www`
  write access. ~3.4 GB RAM free. You install **nothing** new on the host; OfferLens is all containers.

### Decisions already made (for reference)
- One origin `https://offerlens.mueens.tech`; OCR via Azure Document Intelligence **S0, Central India**;
  Google OCR kept behind the switch but unused; `image/webp` not accepted; PLFS city factors and the
  PLFS dataset folder wait on the MoSPI e-mail gate (national salary figures ship first).

### 0.1 Create the Azure OCR resource  [laptop, Azure portal]

OCR (photo and scanned-PDF uploads) needs this. Do it before §4 so you have the endpoint and key to
paste. If you skip it, the site still works for pasted text and text-layer PDFs, and image/scanned
uploads return a clear "not available" message until you set `OCR_PROVIDER=azure` later.

1. Portal → **Create a resource** → search **Document Intelligence** (formerly "Form Recognizer") →
   **Create**.
2. Settings:
   - **Subscription / Resource group:** your startup-credit subscription; a new resource group such
     as `offerlens-rg` is fine.
   - **Region: Central India** (keeps submitted documents in-region).
   - **Name:** e.g. `offerlens-docintel`.
   - **Pricing tier: Standard S0.** Not Free F0 — F0 only reads the first 2 pages of a PDF.
3. **Review + create** → **Create**, then **Go to resource**.
4. Left menu → **Keys and Endpoint**. Copy the **Endpoint** (looks like
   `https://offerlens-docintel.cognitiveservices.azure.com/`) and **KEY 1**. These are
   `AZURE_DOC_INTELLIGENCE_ENDPOINT` and `AZURE_DOC_INTELLIGENCE_KEY` in §4. Treat KEY 1 as a secret.
5. Set a spend guard: portal → **Cost Management + Billing → Budgets → Add** a budget on the
   subscription or `offerlens-rg` (e.g. $10/month) with an alert at 80%. A credit subscription also
   stops when credits run out, which is a natural cap.

> Privacy note: enabling OCR means offer letters are sent to Azure, which stores them transiently
> in-region to run the job, then returns the text. This is new third-party data egress. Choosing
> Central India keeps it in-region. If any UI copy promises the file is deleted, read it with this in
> mind — the app deletes its own temp copy; Azure's transient copy follows Microsoft's retention.

---

## 1. DNS on Namecheap  [laptop, browser]

1. Namecheap → Domain List → `mueens.tech` → **Manage** → **Advanced DNS**.
2. Add a new record:
   - Type: **A Record**
   - Host: `offerlens`
   - Value: `72.61.245.134`
   - TTL: **Automatic**
3. Do **not** add an AAAA record to start (the server has IPv6, but we keep DNS to A-only until
   the site is proven on IPv4; add AAAA later if wanted).
4. Save. Verify from the laptop (allow a few minutes for propagation):

   ```powershell
   # [laptop PowerShell]
   nslookup offerlens.mueens.tech
   # Expect: Address: 72.61.245.134
   ```

---

## 2. Server prep  [server]

Pre-flight, read-only first — confirm what you are joining before changing anything:

```bash
# [server: deploy]  read-only pre-flight
free -h                                  # confirm ~3 GB+ free before adding a stack
docker ps                                # see the production containers already running
docker network ls                        # offerlens network must NOT exist yet
sudo nginx -t                            # host nginx config currently valid
sudo ls /etc/nginx/sites-enabled/        # the other domains' site files
sudo certbot certificates                # existing certs (do not touch them)
```

Create the directories (code/compose under `/srv`, web root under `/var/www`), owned by
`deploy`:

```bash
# [server: sudo]  one-time
sudo mkdir -p /srv/offerlens /var/www/offerlens/dist /var/www/offerlens/datasets /srv/offerlens/backups
sudo chown -R deploy:deploy /srv/offerlens /var/www/offerlens
```

Docker access. If `deploy` is already in the `docker` group (`groups` lists `docker`), you can
run `docker` without sudo. If not, either add it (requires a re-login) or prefix docker commands
with `sudo`:

```bash
# [server: sudo]  only if `groups` does not show docker and you want sudo-less docker
sudo usermod -aG docker deploy      # then log out and back in
# OR: leave the group alone and run every docker command below with `sudo`.
```

---

## 3. Get the code onto the server  [laptop → server]

The repo is private and no deploy token is assumed, so the simplest safe path is to copy the
two build contexts the server needs — `deploy/` and `backend/` — from the laptop with `scp`.
(The frontend is built on the laptop and only its `dist/` is copied, step 7; the server has no
Node.)

```powershell
# [laptop PowerShell]  from the repo root
scp -r deploy  deploy@72.61.245.134:/srv/offerlens/
scp -r backend deploy@72.61.245.134:/srv/offerlens/
```

> `backend/` carries a `.dockerignore` that keeps `node_modules`, `dist`, `uploads` and `.env`
> out of the build context. If `scp` is slow, exclude `node_modules` first (it is rebuilt in the
> image anyway): copy to a temp dir without it, or use `rsync` with `--exclude node_modules` if
> you have it. `git clone` works too if you prefer and have access.

The compose file expects the layout `/srv/offerlens/deploy/docker-compose.prod.yml` with
`../backend` as the build context, which the copy above produces.

---

## 4. Write `.env.production`  [server: deploy]

```bash
# [server: deploy]
cd /srv/offerlens/deploy
cp .env.production.example .env.production
chmod 600 .env.production
```

Generate secrets (no Node on the server — use openssl) and paste them in. Generate FOUR
distinct values: three 48-byte secrets and one DB password:

```bash
# [server: deploy]  run each line, paste the output into the matching variable
openssl rand -base64 48 | tr -d '\n'; echo    # -> JWT_SECRET
openssl rand -base64 48 | tr -d '\n'; echo    # -> JWT_REFRESH_SECRET
openssl rand -base64 48 | tr -d '\n'; echo    # -> COOKIE_SECRET
openssl rand -base64 24                        # -> POSTGRES_PASSWORD
```

Edit `.env.production`:
- `JWT_SECRET`, `JWT_REFRESH_SECRET`, `COOKIE_SECRET` — the three 48-byte values.
- `POSTGRES_PASSWORD` — the 24-byte value, AND paste the SAME value into the
  `__POSTGRES_PASSWORD__` slot inside `DATABASE_URL`.
- `GEMINI_API_KEY` — the real Gemini key (OfferLens falls back to the mock without it).
- **OCR (from §0.1):** set `OCR_PROVIDER=azure`, then uncomment and fill the two Azure lines with
  the values from the Azure portal:
  - `AZURE_DOC_INTELLIGENCE_ENDPOINT=https://<your-resource>.cognitiveservices.azure.com`
  - `AZURE_DOC_INTELLIGENCE_KEY=<KEY 1 from Keys and Endpoint>`

  If you have not created the Azure resource yet, leave `OCR_PROVIDER=mock`: the site works for
  pasted text and text-layer PDFs, and image/scanned uploads return `400 OCR_UNAVAILABLE` until you
  come back, set these three values and restart the api + workers (`docker compose
  -f docker-compose.prod.yml up -d`). No rebuild is needed for an env-only change.
- Leave `CORS_ORIGIN=https://offerlens.mueens.tech`, `TRUST_PROXY=1`,
  `STORAGE_PATH=/app/uploads`, `NODE_ENV=production` as shipped.

Double-check nothing secret leaks: `ls -l .env.production` should show `-rw-------` (600).

---

## 5. Bring up the stack  [server: deploy]

```bash
# [server: deploy]
cd /srv/offerlens/deploy
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps      # api, workers, postgres, redis = Up/healthy
docker compose -f docker-compose.prod.yml logs api --tail=40
```

Look for `Server listening at ...` and `Redis connected` in the api logs, `Workers started...`
in the workers logs, and crucially NOT `using MockAiProvider` (that means the Gemini key is
missing — every analysis would be canned). Postgres and redis should report `healthy`.

The database is empty at this point; migrations and data load from the laptop next.

---

## 6. Migrations, seed and data loads  [laptop, through an SSH tunnel]

The runtime image has no `tsx`/`drizzle-kit`/`drizzle/`/`data/`, so these run from a **laptop
checkout** against the server's Postgres, reached over an SSH tunnel to a temporary
loopback-only port. The migrate override publishes `127.0.0.1:5433` on the server.

**6a. Open the DB port on the server (temporary).**

```bash
# [server: deploy]
cd /srv/offerlens/deploy
docker compose -f docker-compose.prod.yml -f docker-compose.migrate.yml up -d postgres
```

**6b. Tunnel from the laptop.** Keep this shell open for the whole migration window:

```powershell
# [laptop PowerShell]
ssh -L 5433:127.0.0.1:5433 deploy@72.61.245.134
```

**6c. Run migrations and loaders from the laptop checkout.** In a SECOND PowerShell, in the
repo's `backend/`. Point `DATABASE_URL` at the tunnel; use the SAME password you put in
`.env.production`. The seed and loaders read the full config, so set the two JWT secrets too
(any 32+ char value; they are not persisted by these scripts):

```powershell
# [laptop PowerShell]  repo backend/, with deps installed (npm ci)
$env:DATABASE_URL   = "postgres://offerlens:<POSTGRES_PASSWORD>@127.0.0.1:5433/offerlens"
$env:JWT_SECRET     = "x" * 40
$env:JWT_REFRESH_SECRET = "y" * 40
npm run db:migrate          # applies migrations 0000..0008
npm run db:seed             # roles, cities, experience levels (required; dropdowns need it)
npm run db:load-reference   # Stack Overflow salary rows (ODbL) — see the dataset gate below
```

`npm run db:load-city-factors` is a **GATED** step. Run it ONLY after the owner has sent the
MoSPI e-mail and decided to publish PLFS (see `DEPLOYMENT.md` section 6). Until then skip it —
every city falls back to the national figures, which is correct behaviour.

```powershell
# [laptop PowerShell]  ONLY after the MoSPI gate is passed
npm run db:load-city-factors
```

**6d. Tear the tunnel and the port down.** Close the tunnel shell (Ctrl-C / `exit`), then on the
server remove the published DB port (the stack keeps running):

```bash
# [server: deploy]
cd /srv/offerlens/deploy
docker compose -f docker-compose.prod.yml up -d postgres   # drops the 5433 publish
docker compose -f docker-compose.prod.yml ps               # confirm no 5433 mapping remains
```

> The migrate override is temporary by design. Never leave `127.0.0.1:5433` published longer
> than the migration window.

---

## 7. Build the frontend and copy static files  [laptop → server]

```powershell
# [laptop PowerShell]  repo frontend/
cd ..\frontend
$env:VITE_API_BASE_URL = "/api/v1"      # SAME origin: no host, just the path
$env:VITE_GOOGLE_CLIENT_ID = ""          # or the real client ID if Google sign-in is wanted
npm ci
npm run build                            # outputs frontend/dist/
```

Copy the built SPA to the web root:

```powershell
# [laptop PowerShell]  from frontend/
scp -r dist/* deploy@72.61.245.134:/var/www/offerlens/dist/
```

Copy the datasets so the attribution links resolve. The Stack Overflow folder goes up now; the
PLFS folder goes up ONLY after the MoSPI gate. Exclude `__pycache__` and never copy raw PLFS
microdata (there is none in the repo, but do not add it):

```powershell
# [laptop PowerShell]  from the repo root — Stack Overflow (ODbL), ship now
scp -r data\so-2025-india deploy@72.61.245.134:/var/www/offerlens/datasets/
# PLFS city factors — ONLY after the MoSPI e-mail gate is passed:
# scp -r data\plfs-city-factors deploy@72.61.245.134:/var/www/offerlens/datasets/
```

Then on the server, drop the `__pycache__` dir if it rode along:

```bash
# [server: deploy]
rm -rf /var/www/offerlens/datasets/*/__pycache__
```

---

## 8. Install the nginx site and TLS  [server: sudo]

```bash
# [server: sudo]
sudo cp /srv/offerlens/deploy/nginx/offerlens.mueens.tech.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/offerlens.mueens.tech.conf /etc/nginx/sites-enabled/
sudo nginx -t                 # must pass; this host serves other domains too
sudo systemctl reload nginx
```

Issue the certificate (certbot rewrites the server block to add 443 + the HTTP→HTTPS redirect):

```bash
# [server: sudo]
sudo certbot --nginx -d offerlens.mueens.tech
sudo nginx -t && sudo systemctl reload nginx
systemctl list-timers | grep certbot      # confirm the renewal timer is scheduled
```

---

## 9. Smoke test  [laptop + server]

```powershell
# [laptop PowerShell]  health through the PUBLIC URL (proves nginx -> api proxy)
curl.exe https://offerlens.mueens.tech/api/v1/health
# Expect JSON: {status, version, timestamp, uptime}
```

In a browser at `https://offerlens.mueens.tech`:
- Paste an offer's text and run an analysis; a result returns (not canned sample data).
- DevTools → Application → Cookies: `ol_guest` is `HttpOnly` and `Secure`.
- An attribution/benchmark link opens `https://offerlens.mueens.tech/datasets/so-2025-india/`.
- **OCR (only if §0.1 Azure resource is configured):** upload a photo (JPEG/PNG) of an offer and a
  **scanned** PDF (one with no selectable text). Both should extract text and analyse — not return
  the "image uploads are not available" message. A text-layer PDF is handled in the browser and does
  not exercise Azure. If OCR is still `mock`, an image upload is expected to show that message; that
  is correct until §0.1/§4 are done. Watch the api/workers logs during an OCR upload for any Azure
  error (`docker compose -f docker-compose.prod.yml logs api workers --tail=50`).

Upload path and resource check:

```bash
# [server: deploy]  a ~10 MB upload must pass nginx (client_max_body_size is 11m)
#   (do a real upload in the browser; a 413 means client_max_body_size is too low)
docker stats --no-stream        # api/workers under their mem_limit (512m/384m)
free -h                         # host still has headroom
```

---

## 10. Operations

### Update / redeploy  [server: deploy]
```bash
# copy the new backend/ build context from the laptop first (step 3), then:
cd /srv/offerlens/deploy
docker compose -f docker-compose.prod.yml up -d --build
```
Frontend changes: rebuild on the laptop (step 7) and re-copy `dist/`.

### Rollback  [server: deploy]
Images are tagged `offerlens-api`. To roll back, redeploy the previous backend build context and
`up -d --build` again. Migrations are **expand-only**: do not write a destructive down-migration
as part of a rollback; a new forward migration is safer than dropping columns under a running
old image.

### Backups  [server: deploy]
```bash
/srv/offerlens/deploy/scripts/backup-postgres.sh      # gzip dump, keeps 7 days
```
Cron (deploy user's crontab, daily 02:30):
```
30 2 * * * /srv/offerlens/deploy/scripts/backup-postgres.sh >> /srv/offerlens/backups/backup.log 2>&1
```

### Restore  [server: deploy]
```bash
/srv/offerlens/deploy/scripts/restore-postgres.sh /srv/offerlens/backups/offerlens-YYYYMMDD-HHMMSS.sql.gz
# prompts for confirmation; overwrites the current database
```

### Logs  [server: deploy]
- App: `docker compose -f docker-compose.prod.yml logs api|workers --tail=100 -f`
  (json-file, rotated at 10m × 3).
- nginx (this vhost): `/var/log/nginx/offerlens.access.log` and `offerlens.error.log`.

### Stop OfferLens completely (without touching other services)  [server: deploy + sudo]
```bash
# [server: deploy]  stop only the offerlens project
cd /srv/offerlens/deploy
docker compose -f docker-compose.prod.yml down          # add -v ONLY to also delete its volumes
# [server: sudo]  take the public site down (leave the other domains alone)
sudo rm /etc/nginx/sites-enabled/offerlens.mueens.tech.conf
sudo nginx -t && sudo systemctl reload nginx
```

### What NOT to touch on this shared box
- Host nginx config for the OTHER domains in `sites-enabled/`, and their certbot certs.
- Host MySQL, host Redis (`127.0.0.1:6379`), PHP-FPM, and the production Docker containers on
  `127.0.0.1:3010/3100/8000/9000` — OfferLens shares NONE of them.
- UFW rules. Do not open any new port; OfferLens needs none beyond nginx's 80/443.
- The pending OS restart — the owner decides when.

---

## 11. Security & isolation

- **Loopback-only ports.** The only published port in normal operation is the API's
  `127.0.0.1:8100`. Postgres and redis publish nothing. Published Docker ports bypass UFW, so
  binding to `127.0.0.1` is what keeps them off the internet.
- **Own network.** The stack runs in its own `offerlens` bridge network; services reach each
  other by service name (`postgres`, `redis`), not via the host.
- **No shared infrastructure.** OfferLens runs its own Postgres and Redis containers. It does
  NOT use the host MySQL, host Redis, or the other projects' databases.
- **Memory caps + OOM priority.** `mem_limit` caps each service (api 512m, workers 384m,
  postgres 512m, redis 128m) and `oom_score_adj: 500` makes OfferLens the first thing the kernel
  kills under memory pressure, protecting production.
- **Not root.** Everything runs as the `deploy` user; the image runs as the non-root `node`
  user. `sudo` is used only for nginx, certbot and the one-time directory creation.
- **Secrets.** Only in `/srv/offerlens/deploy/.env.production`, mode 600, gitignored. No secret
  is in any committed file or printed by any script (pg_dump/psql run inside the container).
- **No docker.sock mounts, no host bind mounts** except the documented web root and dataset
  dirs served by nginx (read-only static files).

---

## 12. Known limits (be honest about these)

- **Shared box, one machine, no HA.** OfferLens shares CPU/RAM/disk with production. A restart or
  resource spike affects both. There is no failover.
- **Pending OS restart / 76 updates** on the server — the owner's call when to apply them.
- **Old Cloud Vision key in git history** (plan follow-up F1). Issue a NEW key for this deploy;
  revoke the old one if rotation cannot be confirmed.
- **Image + scanned-PDF uploads depend on the Azure OCR resource (§0.1) being set in `.env.production`
  (§4).** With it configured, Azure Document Intelligence `prebuilt-read` reads images **and scanned
  PDFs**. Without it, production refuses image/scanned OCR with `400 OCR_UNAVAILABLE` (not fabricated
  output), while pasted text and text-layer PDFs work. `image/webp` is not an accepted upload type
  (Azure Read does not accept it). Verify OCR end to end in the §9 smoke test.
- **AI mock fallback is silent.** A missing/invalid `GEMINI_API_KEY` falls back to canned
  analysis with only a log warning — there is no production guard. Confirm the logs do not say
  `using MockAiProvider`.
- **PLFS city factors + public dataset** wait on the MoSPI e-mail gate (step 6c / step 7).
- **CI and backups are unverified on this server.** The backup/restore scripts and the cron line
  are written but have not been exercised on the live box.
