#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="46.224.115.100"
SSH_USER="${SSH_USER:-root}"
REMOTE_DIR="/opt/keith-brianborncamp"
SSH_OPTS=""
APP_HOST_PORT="8100"
DOMAIN="keith.brianborncamp.com"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
DOCKER_COMPOSE_CMD="${DOCKER_COMPOSE_CMD:-docker-compose}"

sync() {
  rsync -avz --delete \
    --exclude "__pycache__" \
    --exclude ".venv" \
    --exclude "data" \
    ./ "${SSH_USER}@${REMOTE_HOST}:${REMOTE_DIR}/"
}

remote() {
  ssh ${SSH_OPTS} "${SSH_USER}@${REMOTE_HOST}" "$1"
}

reload_nginx() {
  remote "nginx -t"
  remote "systemctl reload nginx"
}

configure_nginx_http_only() {
  echo "==> Installing temporary HTTP-only nginx config for ${DOMAIN}"
  remote "mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled /var/www/certbot"
  remote "cat > /etc/nginx/sites-available/keith <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        proxy_pass http://127.0.0.1:${APP_HOST_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF"
  remote "ln -sf /etc/nginx/sites-available/keith /etc/nginx/sites-enabled/keith"
  reload_nginx
}

configure_nginx_full() {
  echo "==> Installing HTTPS nginx config for ${DOMAIN}"
  remote "cd ${REMOTE_DIR} && cp ops/nginx/keith.conf.template /etc/nginx/sites-available/keith"
  remote "ln -sf /etc/nginx/sites-available/keith /etc/nginx/sites-enabled/keith"
  reload_nginx
}

obtain_cert() {
  local email_flag
  if [[ -z "${CERTBOT_EMAIL}" ]]; then
    echo "==> Requesting/renewing TLS cert for ${DOMAIN} without email (set CERTBOT_EMAIL to use one)"
    email_flag="--register-unsafely-without-email"
  else
    echo "==> Requesting/renewing TLS cert for ${DOMAIN} with ${CERTBOT_EMAIL}"
    email_flag="--email ${CERTBOT_EMAIL}"
  fi

  remote "certbot certonly --webroot -w /var/www/certbot -d ${DOMAIN} --non-interactive --agree-tos ${email_flag}"
}

main() {
  echo "==> Copying project to ${REMOTE_HOST}:${REMOTE_DIR}"
  remote "mkdir -p ${REMOTE_DIR}"
  sync

  echo "==> Stopping any existing stack"
  remote "cd ${REMOTE_DIR} && ${DOCKER_COMPOSE_CMD} down || true"

  echo "==> Building and starting compose stack"
  remote "cd ${REMOTE_DIR} && APP_HOST_PORT=${APP_HOST_PORT} ${DOCKER_COMPOSE_CMD} build && APP_HOST_PORT=${APP_HOST_PORT} ${DOCKER_COMPOSE_CMD} up -d --remove-orphans"

  configure_nginx_http_only
  obtain_cert
  configure_nginx_full

  echo "Deployment complete. Ensure DNS for ${DOMAIN} points to ${REMOTE_HOST}."
}

main "$@"
