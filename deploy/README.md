# Deploy — VPS bootstrap runbook

One-time setup that gives the auto-deploy pipeline a real target. After this is
done once, every push to `main` runs `test → build-push → deploy` (see
`.github/workflows/ci-cd.yml`) and the `deploy` job SSHes in to `git pull` +
`docker compose pull && up -d` — no further manual steps.

The live app is a single `web` service (Caddy: static host + `/api/<lang>/`
gateway + automatic HTTPS) plus the `backend-java` service — **2 containers**
(`deploy/docker-compose.prod.yml`). There is no separate edge/nginx layer.

## Prerequisites (you provide)

- A VPS you can SSH into (Ubuntu/Debian assumed below), ports 80/443 reachable.
- A domain with a DNS **A record → the VPS public IP**.
- `git` on the VPS.

---

## 1. Install Docker + Compose v2 on the VPS

```bash
curl -fsSL https://get.docker.com | sh
docker compose version    # must print v2.x — the pipeline uses `docker compose` (not docker-compose)
```

## 2. Create a dedicated `deploy` user + SSH key

The pipeline authenticates as a single-purpose user in the `docker` group — never
reuse a personal key.

On the VPS:

```bash
sudo adduser --disabled-password --gecos "" deploy
sudo usermod -aG docker deploy
sudo install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
```

On your machine (or a CI-only spot), generate a **passphrase-less** keypair
(CI can't type a passphrase):

```bash
ssh-keygen -t ed25519 -N "" -C "daily-tools-deploy" -f daily-tools-deploy
```

Install the **public** key on the VPS and keep the **private** key for the
`VPS_SSH_KEY` secret (step 6):

```bash
# public key → VPS
sudo tee -a /home/deploy/.ssh/authorized_keys < daily-tools-deploy.pub
sudo chown deploy:deploy /home/deploy/.ssh/authorized_keys
sudo chmod 600 /home/deploy/.ssh/authorized_keys
```

> Optional hardening: prefix the `authorized_keys` line with
> `from="<github-actions-egress-or-your-ip>"` to restrict where the key may be
> used, and/or `no-pty,no-port-forwarding`.

## 3. Clone the repo as `deploy`

```bash
sudo -u deploy git clone https://github.com/sam101010101010/daily-tools.git /home/deploy/daily-tools
```

This path (`/home/deploy/daily-tools`) is the `DEPLOY_PATH` secret.

## 4. Create `.env` (sets the domain)

```bash
cd /home/deploy/daily-tools
sudo -u deploy cp deploy/.env.example .env
sudo -u deploy sed -i 's/tools.example.com/<your-real-domain>/' .env
```

`.env` is gitignored — it never gets committed. Caddy reads `DOMAIN` via
`SITE_ADDRESS=${DOMAIN}` in `deploy/docker-compose.prod.yml` and auto-issues a
Let's Encrypt certificate for it.

## 5. DNS + firewall

- Confirm the A record is live **before** the first deploy (Caddy needs it to pass
  the ACME challenge — a not-yet-propagated record fails issuance):

  ```bash
  dig +short <your-real-domain>    # must return the VPS public IP
  ```

- Open inbound **80** and **443** (and **22** for SSH) in the VPS firewall /
  cloud security group.

## 6. Set the 4 GitHub secrets

Repo → Settings → Secrets and variables → Actions → **New repository secret**:

| Secret | Value |
|---|---|
| `VPS_HOST` | VPS public IP or hostname |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | **full contents** of the private key file `daily-tools-deploy` (incl. BEGIN/END lines) |
| `DEPLOY_PATH` | `/home/deploy/daily-tools` |

These map 1:1 to the `deploy` job's `secrets.*` references in `ci-cd.yml`.

## 7. Make the GHCR images public

So the VPS can `docker compose pull` without logging in: GitHub → your profile →
Packages → `daily-tools-web` and `daily-tools-backend` → **Package settings →
Change visibility → Public** (this is Task 2 Step 3; the images first appear
after the first push to `main`).

> If you prefer to keep them private, instead run `docker login ghcr.io` on the
> VPS as `deploy` with a PAT (`read:packages`) before the first pull.

## 8. First-start self-check (on the VPS)

Once the images exist (after the first `main` build) and secrets are set, you can
verify manually before relying on the automated deploy:

```bash
cd /home/deploy/daily-tools
sudo -u deploy docker compose -f deploy/docker-compose.prod.yml pull
sudo -u deploy docker compose -f deploy/docker-compose.prod.yml up -d
docker compose -f deploy/docker-compose.prod.yml ps    # both `web` and `backend-java` Up
docker compose -f deploy/docker-compose.prod.yml logs web | grep -i 'certificate\|serving'
```

Expected: 2 services Up; `web` obtains a certificate for your domain and starts
serving. `caddy_data` (a named volume) persists the issued cert across restarts,
so repeated `up -d` won't re-issue and hit Let's Encrypt rate limits.

---

After steps 1–7 are done once, deployment is fully automatic on every push to
`main`. Verification of a real end-to-end deploy and the rollback procedure are
in the next section (added in Task 6).
