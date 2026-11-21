"""Cria (ou redefine a senha de) um administrador da área /admin.

Uso, dentro da pasta backend:
    python criar_admin.py

Pede nome, e-mail e senha no terminal. A senha não aparece enquanto você
digita e é guardada só como hash. Se o e-mail já for de um administrador,
oferece trocar a senha dele.
"""
import getpass
import re
import sys

import pymysql
from werkzeug.security import generate_password_hash

from config import Config

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")


def perguntar(texto, validar, erro):
    while True:
        v = input(texto).strip()
        if validar(v):
            return v
        print(f"  {erro}")


def pedir_senha():
    while True:
        s1 = getpass.getpass("Senha (mín. 10 caracteres, com letras e números): ")
        if len(s1) < 10 or not re.search(r"[A-Za-z]", s1) or not re.search(r"\d", s1):
            print("  Senha fraca. Use pelo menos 10 caracteres, com letras e números.")
            continue
        if getpass.getpass("Repita a senha: ") != s1:
            print("  As senhas não conferem. Tente de novo.")
            continue
        return s1


def main():
    c = Config
    try:
        db = pymysql.connect(host=c.DB_HOST, port=c.DB_PORT, user=c.DB_USER, password=c.DB_PASSWORD,
                             database=c.DB_NAME, charset="utf8mb4", cursorclass=pymysql.cursors.DictCursor)
    except pymysql.err.OperationalError as e:
        sys.exit(f"Não foi possível conectar ao banco ({e.args[-1]}). Confira o backend/.env.")

    print("== Criar administrador da Radiance ==")
    email = perguntar("E-mail: ", lambda v: EMAIL_RE.match(v.lower()), "E-mail inválido.").lower()

    with db.cursor() as cur:
        try:
            cur.execute("SELECT id, nome FROM administrador WHERE email = %s", (email,))
        except pymysql.err.ProgrammingError:
            sys.exit("A tabela 'administrador' não existe. Rode a migração "
                     "banco/migracoes/001_area_administrativa.sql (veja docs/INSTALACAO.md).")
        existente = cur.fetchone()

        if existente:
            resp = input(f"Já existe o administrador {existente['nome']}. Trocar a senha dele? [s/N] ")
            if resp.strip().lower() not in ("s", "sim"):
                print("Nada foi alterado.")
                return
            cur.execute("UPDATE administrador SET senha_hash = %s, ativo = TRUE WHERE id = %s",
                        (generate_password_hash(pedir_senha()), existente["id"]))
            db.commit()
            print("Senha atualizada.")
            return

        nome = perguntar("Nome: ", lambda v: len(v) >= 2, "Informe o nome.")
        senha = pedir_senha()
        cur.execute("INSERT INTO administrador (nome, email, senha_hash) VALUES (%s, %s, %s)",
                    (nome, email, generate_password_hash(senha)))
    db.commit()
    print(f"Administrador {nome} criado. Entre em /admin com {email}.")


if __name__ == "__main__":
    main()
