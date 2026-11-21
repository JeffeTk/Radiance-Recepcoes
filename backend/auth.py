"""Conta do cliente: cadastro com código por e-mail, login, logout e sessão.

Rotas (as mesmas que o site chama em assets/main.js):
  POST /api/cadastro            → valida, guarda em cadastro_pendente e envia o código
  POST /api/cadastro/confirmar  → confere o código, cria o cliente e faz login
  POST /api/cadastro/reenviar   → gera e envia um código novo
  POST /api/login
  POST /api/logout
  GET  /api/me                  → cliente logado (401 se não estiver)
"""
import hashlib
import hmac
import json
import secrets
import time
from collections import defaultdict, deque

from flask import Blueprint, current_app, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

from db import get_db
import smtplib

from email_envio import enviar_codigo as _enviar_codigo
from validacao import EMAIL_RE, ErroValidacao, validar_cadastro

bp = Blueprint("auth", __name__, url_prefix="/api")


# ---------------------------------------------------------------- utilitários
def usuario_publico(c: dict) -> dict:
    """Só o que o site precisa — nunca a senha nem o CPF."""
    return {"id": c["id"], "nome": c["nome"], "email": c["email"], "telefone": c["telefone"]}


def hash_codigo(email: str, codigo: str) -> str:
    # HMAC com a SECRET_KEY: mesmo quem tiver acesso ao banco não consegue
    # descobrir o código testando os 1 milhão de combinações.
    chave = current_app.config["SECRET_KEY"].encode()
    return hmac.new(chave, f"{email}:{codigo}".encode(), hashlib.sha256).hexdigest()


def novo_codigo() -> str:
    return f"{secrets.randbelow(10**6):06d}"


# Horários: todas as contas de validade/espera usam o relógio do BANCO
# (NOW() no SQL). Assim não importa se o servidor Python e o MySQL estão
# em fusos diferentes (ex.: Brasília x UTC na hospedagem).


def corpo_json() -> dict:
    d = request.get_json(silent=True)
    if not isinstance(d, dict):
        raise ErroValidacao("Requisição inválida.")
    return d


def enviar_codigo(email, nome, codigo):
    try:
        _enviar_codigo(email, nome, codigo)
    except (smtplib.SMTPException, OSError):
        current_app.logger.exception("Falha ao enviar e-mail para %s", email)
        raise ErroValidacao("Não conseguimos enviar o e-mail agora. Tente novamente em instantes.", status=502)


def fazer_login(cliente: dict) -> None:
    session.clear()
    session.permanent = True
    session["cliente_id"] = cliente["id"]


# Limite simples de tentativas de login (por IP + e-mail), em memória.
# Num servidor com vários processos, cada processo conta separado — para
# algo mais robusto, use Redis ou a extensão Flask-Limiter.
_tentativas_login = defaultdict(deque)
LOGIN_MAX, LOGIN_JANELA_S = 10, 15 * 60


def login_bloqueado(chave: str) -> bool:
    fila = _tentativas_login[chave]
    limite = time.time() - LOGIN_JANELA_S
    while fila and fila[0] < limite:
        fila.popleft()
    return len(fila) >= LOGIN_MAX


# ---------------------------------------------------------------- cadastro
@bp.post("/cadastro")
def cadastro():
    dados = validar_cadastro(corpo_json())
    db = get_db()
    with db.cursor() as cur:
        cur.execute("SELECT email, cpf FROM cliente WHERE email = %s OR cpf = %s",
                    (dados["email"], dados["cpf"]))
        for existente in cur.fetchall():
            if existente["email"] == dados["email"]:
                raise ErroValidacao("Já existe uma conta com este e-mail.", "email", 409)
            raise ErroValidacao("Já existe uma conta com este CPF.", "cpf", 409)

        # A senha é guardada já em hash, mesmo no cadastro pendente.
        pendente = {k: v for k, v in dados.items() if k != "senha"}
        pendente["senha_hash"] = generate_password_hash(dados["senha"])

        codigo = novo_codigo()
        # Se a pessoa refizer o cadastro com o mesmo e-mail, substitui o anterior.
        cur.execute(
            """INSERT INTO cadastro_pendente (email, dados, codigo_hash, expira_em, tentativas, data_envio)
               VALUES (%s, %s, %s, NOW() + INTERVAL %s MINUTE, 0, NOW())
               ON DUPLICATE KEY UPDATE dados = VALUES(dados), codigo_hash = VALUES(codigo_hash),
                 expira_em = VALUES(expira_em), tentativas = 0, data_envio = VALUES(data_envio)""",
            (dados["email"], json.dumps(pendente, ensure_ascii=False),
             hash_codigo(dados["email"], codigo), current_app.config["CODIGO_VALIDADE_MIN"]),
        )
    enviar_codigo(dados["email"], dados["nome"], codigo)
    db.commit()
    return jsonify({"email": dados["email"]})


@bp.post("/cadastro/confirmar")
def confirmar_cadastro():
    d = corpo_json()
    email = str(d.get("email") or "").strip().lower()
    codigo = str(d.get("codigo") or "").strip()
    if not EMAIL_RE.match(email):
        raise ErroValidacao("Cadastro não encontrado. Preencha os dados de novo.")
    if not (len(codigo) == 6 and codigo.isdigit()):
        raise ErroValidacao("Digite os 6 números do código.", "codigo")

    cfg = current_app.config
    db = get_db()
    with db.cursor() as cur:
        cur.execute("SELECT *, expira_em < NOW() AS expirado FROM cadastro_pendente "
                    "WHERE email = %s FOR UPDATE", (email,))
        p = cur.fetchone()
        if not p:
            raise ErroValidacao("Cadastro não encontrado. Preencha os dados de novo.", status=404)
        if p["expirado"]:
            raise ErroValidacao('O código expirou. Clique em "Reenviar código".', "codigo", 410)
        if p["tentativas"] >= cfg["CODIGO_MAX_TENTATIVAS"]:
            raise ErroValidacao('Muitas tentativas. Clique em "Reenviar código".', "codigo", 429)
        if not hmac.compare_digest(p["codigo_hash"], hash_codigo(email, codigo)):
            cur.execute("UPDATE cadastro_pendente SET tentativas = tentativas + 1 WHERE id = %s", (p["id"],))
            db.commit()
            raise ErroValidacao("Código incorreto. Confira e tente de novo.", "codigo")

        dados = json.loads(p["dados"]) if isinstance(p["dados"], str) else p["dados"]
        cur.execute("SELECT id FROM cliente WHERE email = %s OR cpf = %s", (email, dados["cpf"]))
        if cur.fetchone():
            cur.execute("DELETE FROM cadastro_pendente WHERE id = %s", (p["id"],))
            db.commit()
            raise ErroValidacao("Já existe uma conta com este e-mail ou CPF. Faça login.", status=409)

        cur.execute(
            """INSERT INTO cliente (nome, cpf, data_nascimento, endereco_cep, endereco_rua,
                 endereco_numero, endereco_bairro, endereco_cidade, endereco_uf,
                 telefone, email, email_verificado_em, senha_hash)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW(),%s)""",
            (dados["nome"], dados["cpf"], dados["data_nascimento"], dados["endereco_cep"],
             dados["endereco_rua"], dados["endereco_numero"], dados["endereco_bairro"],
             dados["endereco_cidade"], dados["endereco_uf"], dados["telefone"], email,
             dados["senha_hash"]),
        )
        novo_id = cur.lastrowid
        cur.execute("DELETE FROM cadastro_pendente WHERE id = %s", (p["id"],))
        cur.execute("SELECT * FROM cliente WHERE id = %s", (novo_id,))
        cliente = cur.fetchone()
    db.commit()
    fazer_login(cliente)
    return jsonify(usuario_publico(cliente)), 201


@bp.post("/cadastro/reenviar")
def reenviar_codigo():
    email = str(corpo_json().get("email") or "").strip().lower()
    cfg = current_app.config
    db = get_db()
    with db.cursor() as cur:
        cur.execute("SELECT *, TIMESTAMPDIFF(SECOND, data_envio, NOW()) AS segundos_desde_envio "
                    "FROM cadastro_pendente WHERE email = %s FOR UPDATE", (email,))
        p = cur.fetchone()
        if not p:
            raise ErroValidacao("Cadastro não encontrado. Preencha os dados de novo.", status=404)
        espera = cfg["CODIGO_ESPERA_REENVIO_S"] - p["segundos_desde_envio"]
        if espera > 0:
            raise ErroValidacao(f"Aguarde {int(espera) + 1} segundos para pedir outro código.", status=429)

        codigo = novo_codigo()
        cur.execute(
            """UPDATE cadastro_pendente
               SET codigo_hash = %s, expira_em = NOW() + INTERVAL %s MINUTE, tentativas = 0, data_envio = NOW()
               WHERE id = %s""",
            (hash_codigo(email, codigo), cfg["CODIGO_VALIDADE_MIN"], p["id"]),
        )
        dados = json.loads(p["dados"]) if isinstance(p["dados"], str) else p["dados"]
    enviar_codigo(email, dados.get("nome", ""), codigo)
    db.commit()
    return jsonify({"email": email})


# ---------------------------------------------------------------- login / sessão
@bp.post("/login")
def login():
    d = corpo_json()
    email = str(d.get("email") or "").strip().lower()
    senha = str(d.get("senha") or "")
    chave = f"{request.remote_addr}|{email}"
    if login_bloqueado(chave):
        raise ErroValidacao("Muitas tentativas de login. Aguarde alguns minutos e tente de novo.", status=429)

    with get_db().cursor() as cur:
        cur.execute("SELECT * FROM cliente WHERE email = %s", (email,))
        cliente = cur.fetchone()
    # Mensagem genérica de propósito: não revela se o e-mail tem conta.
    if not cliente or not check_password_hash(cliente["senha_hash"], senha):
        _tentativas_login[chave].append(time.time())
        raise ErroValidacao("E-mail ou senha incorretos.", status=401)

    _tentativas_login.pop(chave, None)
    fazer_login(cliente)
    return jsonify(usuario_publico(cliente))


@bp.post("/logout")
def logout():
    session.clear()
    return jsonify({"ok": True})


def cliente_logado():
    cid = session.get("cliente_id")
    if not cid:
        return None
    with get_db().cursor() as cur:
        cur.execute("SELECT * FROM cliente WHERE id = %s", (cid,))
        c = cur.fetchone()
    if not c:
        session.clear()
    return c


@bp.get("/me")
def me():
    c = cliente_logado()
    if not c:
        return jsonify({"mensagem": "Não autenticado."}), 401
    return jsonify(usuario_publico(c))
