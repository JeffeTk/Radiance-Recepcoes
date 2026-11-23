#!/usr/bin/env bash
# Roda uma vez, quando o Codespace é criado.
set -euo pipefail
cd "$(dirname "$0")/../backend"

echo "==> Instalando o cliente do MySQL (para consultas e migrações no terminal)..."
(sudo apt-get update -qq && sudo apt-get install -y -qq default-mysql-client >/dev/null) \
  || echo "    Não foi possível instalar agora; dá para instalar depois (veja docs/INSTALACAO.md)."

echo "==> Instalando as dependências do back-end..."
pip install --user --disable-pip-version-check -q -r requirements.txt

if [ ! -f .env ]; then
  echo "==> Criando backend/.env para o Codespace..."
  SECRET=$(python -c "import secrets; print(secrets.token_hex(32))")
  cat > .env <<ENV
# Gerado automaticamente pelo Codespace (.devcontainer/post-create.sh).
# Não envie este arquivo para o GitHub (ele está no .gitignore).
SECRET_KEY=${SECRET}

DB_HOST=db
DB_PORT=3306
DB_USER=radiance
DB_PASSWORD=radiance-dev
DB_NAME=radiance

# Sem SMTP: o código de verificação aparece no terminal do servidor.
# Para enviar e-mail de verdade, preencha como no README (parte do Gmail).
SMTP_HOST=
SMTP_PORT=587
SMTP_SSL=false
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=Radiance Recepções e Eventos <radiance.recepcoes@gmail.com>

# O Codespace já entrega o site em HTTPS
COOKIE_SECURE=true

# 1 = modo de desenvolvimento (recarrega ao editar). Mude para 0 antes de
# deixar a porta 5000 pública para outras pessoas verem.
FLASK_DEBUG=1
ENV
else
  echo "==> backend/.env já existe — mantido como está."
fi
echo "==> Pronto."
echo ""
echo "Contas de teste (criadas por banco/dados_teste.sql):"
echo "    Área administrativa (/admin): adm@gmail.com   / se12345678"
echo "    Cliente do site:              teste@gmail.com / te12345678"
