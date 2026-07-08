# Deploy — VPS bootstrap runbook

One-time setup that gives the auto-deploy pipeline a real target. After this is
done once, every push to `main` runs `test → build-push → deploy` (see
`.github/workflows/ci-cd.yml`): the `deploy` job `scp`s the (tag-pinned) compose
file to the VPS and SSHes in to `docker compose pull && up -d` — no further
manual steps. The VPS never contacts `github.com` (the runner holds the repo and
`scp`s only the small compose file), but it **does** pull the images from
`ghcr.io` — which is CDN-fronted and fast, and fetches only changed layers on
later deploys, so a deploy is ~9min the first time and ~2–3min after
([ADR-0004](../adr/0004-deploy-ghcr-pull.md)).

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

The pipeline `scp`s the (tag-pinned) compose file here; no git clone needed.

```bash
sudo -u deploy mkdir -p /home/deploy/daily-tools
```

This path (`/home/deploy/daily-tools`) is the `DEPLOY_PATH` secret — just a
directory holding `.env` and receiving the runner's `scp`. The runner drops the
tag-pinned `deploy/docker-compose.prod.yml` into it on every deploy; the VPS then
`docker compose pull`s the images from ghcr.io.

## 4. Create `.env` (sets the domain)

There's no git clone on the VPS, so create `.env` directly in `$DEPLOY_PATH`:

```bash
cd /home/deploy/daily-tools
sudo -u deploy sh -c "printf 'DOMAIN=<your-real-domain>\n' > .env"
```

(e.g. `DOMAIN=tools.sam.pub`)

`.env` is gitignored in the source repo — it never gets committed, and it
persists on the VPS across deploys since the pipeline only overwrites the
compose file, not `.env`. Caddy reads `DOMAIN` via
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

The VPS pulls the images from `ghcr.io` on every deploy, so the two packages must
be pullable without VPS-side credentials. Make `daily-tools-web` and
`daily-tools-backend` **public**: GitHub → your profile → Packages → the package →
**Package settings → Change visibility → Public** (they first appear after the
first push to `main`) ([ADR-0004](../adr/0004-deploy-ghcr-pull.md) D4).

> If you must keep them private, instead run `docker login ghcr.io` on the VPS as
> `deploy` with a PAT (`read:packages`) before the first deploy.

## 8. First-start self-check (on the VPS)

After the first automated deploy has landed the compose file (and secrets are
set), you can re-run the deploy steps by hand — the VPS pulls the images from
ghcr.io:

```bash
cd /home/deploy/daily-tools
sudo -u deploy docker compose -f deploy/docker-compose.prod.yml pull   # first pull ~9min (full image), later ~2-3min (changed layers only)
sudo -u deploy docker compose -f deploy/docker-compose.prod.yml up -d
docker compose -f deploy/docker-compose.prod.yml ps    # both `web` and `backend-java` Up
docker compose -f deploy/docker-compose.prod.yml logs web | grep -i 'certificate\|serving'
```

Expected: 2 services Up; `web` obtains a certificate for your domain and starts
serving. `caddy_data` (a named volume) persists the issued cert across restarts,
so repeated `up -d` won't re-issue and hit Let's Encrypt rate limits.

> The compose file on the VPS is placed by the pipeline (`scp`), tag-pinned to a
> specific image sha — there is no git clone. Before the very first pipeline run
> there is no compose file on the VPS yet; let the pipeline land it, or copy one
> over manually.

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
  到的历史 commit sha → deploy job 把 compose 的 image tag 钉成该 sha、`scp` 给 VPS →
  VPS 从 ghcr.io `docker compose pull` 该 sha → `up -d`。
- 或者本地 `git revert` 目标 commit 后 push 到 `main`，走正常的
  `test → build-push → deploy` 管线（会为 revert 后的新 commit 重新 build 镜像）。
