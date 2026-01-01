# Three Scholar Answers

Lightweight FastAPI app that sends a single question to the OpenAI Chat Completions API using three personas (Buddhist, Taoist, Hindu). API keys live in SQLite and are managed from the in-app settings page—no env vars required.

## Stack
- FastAPI + Uvicorn
- SQLite (file stored in `data/` volume)
- Vanilla JS frontend served as static files
- Docker + docker-compose

## Local run
```bash
# build + run
docker compose up --build
# app will be on http://localhost:8088
```

## Usage
1. Open the app and go to **Settings**.
2. Create an OpenAI API key at https://platform.openai.com/api-keys (ensure billing or credits are active).
3. Paste the key into the settings form; it is stored in SQLite on the server.
4. Return to **Ask**, enter your question, and view three scholar responses.

## Deployment (VPS 46.224.115.100)
- SSH keys are assumed to be in place.
- Update DNS for `keith.brianborncamp.com` to point to the VPS.
- Host port `8100` is mapped to container port `8000` in `docker-compose.yml` and expected by the nginx config.
- Nginx (on the host) proxies 80/443 to host port `8100` and serves ACME challenges. `deploy.sh` syncs a temporary HTTP-only config, obtains the cert (webroot), then installs the HTTPS config from `ops/nginx/keith.conf.template` and reloads nginx.
- Set `CERTBOT_EMAIL` before running `deploy.sh` to issue/renew the TLS cert via certbot; if unset, the script will request a cert without an email (using `--register-unsafely-without-email`).

Deploy script:
```bash
CERTBOT_EMAIL=you@example.com ./deploy.sh
```
The script rsyncs the project to `/opt/keith-brianborncamp` on the VPS and runs `docker compose build && docker compose up -d` there.

## Data
SQLite file is stored in the `app_data` docker volume. Removing the volume clears saved API keys.
