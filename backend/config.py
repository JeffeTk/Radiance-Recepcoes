"""Configurações lidas do arquivo .env (veja .env.example)."""
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


def _bool(nome, padrao=False):
    return os.getenv(nome, str(padrao)).strip().lower() in ("1", "true", "sim", "yes")


class Config:
    # Chave usada para assinar o cookie de sessão e o hash do código de e-mail.
    # Em produção, use um valor longo e aleatório (veja o README).
    SECRET_KEY = os.getenv("SECRET_KEY", "")

    # Banco de dados (MySQL 8 / MariaDB 10.5+)
    DB_HOST = os.getenv("DB_HOST", "localhost")
    DB_PORT = int(os.getenv("DB_PORT", "3306"))
    DB_USER = os.getenv("DB_USER", "root")
    DB_PASSWORD = os.getenv("DB_PASSWORD", "")
    DB_NAME = os.getenv("DB_NAME", "radiance")

    # E-mail (SMTP). Se SMTP_HOST ficar vazio, o código de verificação é
    # mostrado no terminal em vez de enviado — útil só em desenvolvimento.
    SMTP_HOST = os.getenv("SMTP_HOST", "")
    SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
    SMTP_FROM = os.getenv("SMTP_FROM", "Radiance Recepções e Eventos <radiance.recepcoes@gmail.com>")
    SMTP_SSL = _bool("SMTP_SSL")  # True para porta 465; False usa STARTTLS (587)

    # Pasta com index.html, reserva.html e assets/
    SITE_DIR = Path(os.getenv("SITE_DIR", BASE_DIR.parent / "site")).resolve()

    # Cookie de sessão
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_SECURE = _bool("COOKIE_SECURE", False)  # True quando o site estiver em HTTPS
    PERMANENT_SESSION_LIFETIME = 60 * 60 * 24 * 14  # 14 dias

    # Regras de negócio (as mesmas do site e do banco)
    CODIGO_VALIDADE_MIN = 10
    CODIGO_MAX_TENTATIVAS = 5
    CODIGO_ESPERA_REENVIO_S = 60
    CONVIDADOS_MAX = 100
