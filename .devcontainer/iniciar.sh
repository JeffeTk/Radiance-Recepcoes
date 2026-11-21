#!/usr/bin/env bash
# Roda toda vez que você abre o Codespace: espera o MySQL e inicia o site.
set -uo pipefail
cd "$(dirname "$0")/../backend"

# Já está rodando (ex.: você abriu o Codespace em outra aba)? Não inicia de novo.
if python -c "import socket,sys; s=socket.socket(); sys.exit(0 if s.connect_ex(('127.0.0.1',5000))==0 else 1)"; then
  echo "O site já está rodando na porta 5000 (aba PORTAS → Site Radiance)."
  exit 0
fi

echo "==> Esperando o banco de dados ficar pronto..."
if ! python - <<'PY'
import sys, time, pymysql
from dotenv import dotenv_values
c = dotenv_values(".env")
for tentativa in range(60):          # até ~2 minutos (na 1ª vez o MySQL ainda está criando o banco)
    try:
        pymysql.connect(host=c["DB_HOST"], port=int(c["DB_PORT"]), user=c["DB_USER"],
                        password=c["DB_PASSWORD"], database=c["DB_NAME"]).close()
        print("    banco pronto.")
        sys.exit(0)
    except pymysql.err.OperationalError:
        time.sleep(2)
print("    O banco não respondeu.")
sys.exit(1)
PY
then
  echo ""
  echo "O site NÃO foi iniciado, porque sem o banco o cadastro, o login e o calendário não funcionam."
  echo "Se a pasta .devcontainer foi adicionada depois de criar o Codespace, reconstrua:"
  echo "  Ctrl+Shift+P → Codespaces: Rebuild Container"
  echo "Se acabou de criar o Codespace, espere 1 minuto e rode de novo: bash .devcontainer/iniciar.sh"
  exit 1
fi

echo ""
echo "==> Iniciando o site em http://localhost:5000"
echo "    Abra pela aba PORTAS → 'Site Radiance' → ícone do globo."
echo "    Os códigos de verificação de e-mail aparecem aqui embaixo."
echo ""
exec python app.py
