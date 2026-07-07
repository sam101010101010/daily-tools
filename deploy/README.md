# Deploy — VPS bootstrap runbook

One-time setup that gives the auto-deploy pipeline a real target. After this is
done once, every push to `main` runs `test → build-push → deploy` (see
`.github/workflows/ci-cd.yml`) and the `deploy` job SSHes in to `docker load` +
`docker compose up -d` — no further manual steps. The VPS never contacts
`github.com` or `ghcr.io`: the runner `docker save`s the images, `scp`s the
tarball (and the compose file) to the VPS, and the VPS only `docker load`s
what arrives.

The live app is a single `web` service (Caddy: static host + `/api/<lang>/`
gateway + automatic HTTPS) plus the `backend-java` service — **2 containers**
(`deploy/docker-compose.prod.yml`). There is no separate edge/nginx layer.

## Prerequisites (you provide)

- A VPS you can SSH into (Ubuntu/Debian assumed below), ports 80/443 reachable.
- A domain with a DNS **A record → the VPS public IP**.

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

## 3. Create the deploy directory

The pipeline `scp`s the compose file and image tarball here; no git clone needed.

```bash
sudo -u deploy mkdir -p /home/deploy/daily-tools
```

This path (`/home/deploy/daily-tools`) is the `DEPLOY_PATH` secret — just a
directory holding `.env` and receiving the runner's `scp`. The runner drops
`deploy/docker-compose.prod.yml` and `images.tar.gz` into it on every deploy.

## 4. Create `.env` (sets the domain)

There's no git clone on the VPS, so create `.env` directly in `$DEPLOY_PATH`:

```bash
cd /home/deploy/daily-tools
sudo -u deploy sh -c "printf 'DOMAIN=<your-real-domain>\n' > .env"
```

(e.g. `DOMAIN=tools.sam.pub`)

`.env` is gitignored in the source repo — it never gets committed, and it
persists on the VPS across deploys since the pipeline only overwrites the
compose file and image tarball, not `.env`. Caddy reads `DOMAIN` via
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

## 7. GHCR image visibility (public or private both work)

Air-gap deploy means the VPS never pulls from GHCR at all — only the runner
does, authenticating with `GITHUB_TOKEN`
([ADR-0003](../adr/0003-deploy-airgap-scp.md) D4). So making
`daily-tools-web` / `daily-tools-backend` public is no longer required for the
VPS to function; keep them public or switch to private, either works. Nothing
to configure here unless you have another reason to change visibility
(GitHub → your profile → Packages → package → **Package settings → Change
visibility**).

## 8. First-start self-check (on the VPS)

There's no manual `pull` here — air-gap means the VPS never pulls; the images
arrive as a tarball the pipeline `scp`s and `docker load`s in. Once the first
pipeline run has landed the compose file + image tarball and loaded them
(and secrets are set), you can verify manually:

```bash
cd /home/deploy/daily-tools
sudo -u deploy docker compose -f deploy/docker-compose.prod.yml up -d
docker compose -f deploy/docker-compose.prod.yml ps    # both `web` and `backend-java` Up
docker compose -f deploy/docker-compose.prod.yml logs web | grep -i 'certificate\|serving'
```

If you need to load images manually (before the pipeline has run once), do it
from the runner or your own machine — the VPS itself never fetches from GHCR:

```bash
docker pull ghcr.io/sam101010101010/daily-tools-web:latest
docker pull ghcr.io/sam101010101010/daily-tools-backend:latest
docker save ghcr.io/sam101010101010/daily-tools-web:latest ghcr.io/sam101010101010/daily-tools-backend:latest | ssh deploy@<vps-host> 'docker load'
```

Expected: 2 services Up; `web` obtains a certificate for your domain and starts
serving. `caddy_data` (a named volume) persists the issued cert across restarts,
so repeated `up -d` won't re-issue and hit Let's Encrypt rate limits.

---

After steps 1–7 are done once, deployment is fully automatic on every push to
`main`. See the next section for end-to-end verification and rollback.

## 验证 & 回滚

**验证**（push 后，pipeline 跑完）：

```bash
curl -sI https://<domain>/ | grep -i 'HTTP'
curl -s -X POST https://<domain>/api/java/dns -H 'content-type: application/json' -d '{"domain":"example.com"}'
```

判据：第一条返回 `HTTP/2 200`（证书有效）；首页可见 4 个工具；第二条 `/api/java/*`
返回 `{"ok":true,...}` 形状的响应体（[ADR-0001](../adr/0001-daily-tools-architecture.md)
D4 的响应信封）。

**回滚**：两种方式均可，镜像不会因为不再 build 而消失——旧 sha 对应的 GHCR 镜像长期留存：

- GitHub → **Actions** → `CI/CD` workflow → **Run workflow**，`sha` 输入填要回退
  到的历史 commit sha → runner 用该 sha 重新 **拉**（`GITHUB_TOKEN` 从 GHCR）→
  **存盘**（`docker save`）→ `scp` → VPS `docker load` → `up -d`。
- 或者本地 `git revert` 目标 commit 后 push 到 `main`，走正常的
  `test → build-push → deploy` 管线（会为 revert 后的新 commit 重新 build 镜像）。
