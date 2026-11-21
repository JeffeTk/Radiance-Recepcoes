"""Área administrativa (/admin) — só para administradores.

Rotas:
  POST /api/admin/login      { email, senha }
  POST /api/admin/logout
  GET  /api/admin/me
  GET  /api/admin/clientes?q=texto   → busca por nome, CPF ou telefone
  GET  /api/admin/reservas           → reservas mais recentes
  POST /api/admin/reservas           → registra uma reserva feita fora do site
                                       (rede social, telefone, presencial)

O administrador é criado pelo comando:  python criar_admin.py
"""
import time
from functools import wraps

from flask import Blueprint, current_app, jsonify, request, session
from werkzeug.security import check_password_hash

from auth import _tentativas_login, corpo_json, login_bloqueado
from db import get_db
from reservas import STATUS_OCUPAM
from validacao import ErroValidacao, so_digitos, validar_cliente_admin, validar_reserva_admin

bp = Blueprint("admin", __name__, url_prefix="/api/admin")


def admin_logado():
    aid = session.get("admin_id")
    if not aid:
        return None
    with get_db().cursor() as cur:
        cur.execute("SELECT id, nome, email FROM administrador WHERE id = %s AND ativo = TRUE", (aid,))
        a = cur.fetchone()
    if not a:
        session.pop("admin_id", None)
    return a


def exige_admin(f):
    """Toda rota com isto responde 401 para quem não é administrador."""
    @wraps(f)
    def interna(*args, **kwargs):
        admin = admin_logado()
        if not admin:
            raise ErroValidacao("Acesso restrito. Entre como administrador.", status=401)
        return f(admin, *args, **kwargs)
    return interna


# ---------------------------------------------------------------- login
@bp.post("/login")
def login():
    d = corpo_json()
    email = str(d.get("email") or "").strip().lower()
    senha = str(d.get("senha") or "")
    chave = f"admin|{request.remote_addr}|{email}"
    if login_bloqueado(chave):
        raise ErroValidacao("Muitas tentativas. Aguarde alguns minutos e tente de novo.", status=429)

    with get_db().cursor() as cur:
        cur.execute("SELECT * FROM administrador WHERE email = %s AND ativo = TRUE", (email,))
        a = cur.fetchone()
    if not a or not check_password_hash(a["senha_hash"], senha):
        _tentativas_login[chave].append(time.time())
        raise ErroValidacao("E-mail ou senha incorretos.", status=401)

    _tentativas_login.pop(chave, None)
    session.permanent = True
    session["admin_id"] = a["id"]
    return jsonify({"id": a["id"], "nome": a["nome"], "email": a["email"]})


@bp.post("/logout")
def logout():
    session.pop("admin_id", None)
    return jsonify({"ok": True})


@bp.get("/me")
@exige_admin
def me(admin):
    return jsonify(admin)


# ---------------------------------------------------------------- clientes
def cliente_json(c: dict) -> dict:
    return {
        "id": c["id"], "nome": c["nome"], "cpf": c["cpf"], "telefone": c["telefone"],
        "email": c["email"], "tem_conta": bool(c["senha_hash"]),
        "cidade": c["endereco_cidade"], "uf": c["endereco_uf"],
    }


@bp.get("/clientes")
@exige_admin
def buscar_clientes(admin):
    q = str(request.args.get("q") or "").strip()
    if len(q) < 2:
        return jsonify([])
    digitos = so_digitos(q)
    with get_db().cursor() as cur:
        if len(digitos) >= 3:   # CPF ou telefone (com ou sem máscara)
            cur.execute("SELECT * FROM cliente WHERE cpf LIKE %s OR telefone LIKE %s ORDER BY nome LIMIT 15",
                        (f"%{digitos}%", f"%{digitos}%"))
        else:
            cur.execute("SELECT * FROM cliente WHERE nome LIKE %s ORDER BY nome LIMIT 15", (f"%{q}%",))
        return jsonify([cliente_json(c) for c in cur.fetchall()])


# ---------------------------------------------------------------- reservas
@bp.get("/reservas")
@exige_admin
def listar_reservas(admin):
    with get_db().cursor() as cur:
        cur.execute(
            """SELECT a.id, a.data_inicio_evento, a.data_final_evento, a.tipo_evento, a.turno,
                      a.num_convidados, a.status, a.valor_total, a.origem, a.data_solicitacao,
                      c.nome AS cliente, c.telefone,
                      ad.nome AS registrado_por,
                      (SELECT COALESCE(SUM(p.valor), 0) FROM pagamento p
                        WHERE p.id_aluguel = a.id AND p.status = 'pago') AS total_pago
               FROM aluguel a
               JOIN cliente c ON c.id = a.id_cliente
               LEFT JOIN administrador ad ON ad.id = a.registrado_por
               ORDER BY a.data_inicio_evento DESC, a.id DESC
               LIMIT 300"""
        )
        linhas = cur.fetchall()
    for r in linhas:
        for k in ("data_inicio_evento", "data_final_evento"):
            r[k] = r[k].isoformat()
        r["data_solicitacao"] = r["data_solicitacao"].isoformat(sep=" ", timespec="minutes")
        r["valor_total"] = str(r["valor_total"]) if r["valor_total"] is not None else None
        r["total_pago"] = str(r["total_pago"])
    return jsonify(linhas)


@bp.post("/reservas")
@exige_admin
def registrar_reserva(admin):
    d = corpo_json()
    r = validar_reserva_admin(d, current_app.config["CONVIDADOS_MAX"])
    db = get_db()
    with db.cursor() as cur:
        # ---- cliente: um já cadastrado ou um novo ----
        if d.get("cliente_id"):
            cur.execute("SELECT * FROM cliente WHERE id = %s", (d["cliente_id"],))
            cliente = cur.fetchone()
            if not cliente:
                raise ErroValidacao("Cliente não encontrado. Busque de novo.", "cliente", 404)
        else:
            novo = validar_cliente_admin(d.get("cliente") or {})
            cur.execute("SELECT id, nome FROM cliente WHERE cpf = %s", (novo["cpf"],))
            existente = cur.fetchone()
            if existente:
                raise ErroValidacao(
                    f"Já existe um cliente com este CPF ({existente['nome']}). "
                    "Use a opção \"Cliente já cadastrado\".", "cpf", 409)
            if novo["email"]:
                cur.execute("SELECT id FROM cliente WHERE email = %s", (novo["email"],))
                if cur.fetchone():
                    raise ErroValidacao("Este e-mail já pertence a outro cliente.", "email", 409)
            cur.execute(
                """INSERT INTO cliente (nome, cpf, data_nascimento, telefone, email,
                     endereco_cep, endereco_rua, endereco_numero, endereco_bairro,
                     endereco_cidade, endereco_uf)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (novo["nome"], novo["cpf"], novo["data_nascimento"], novo["telefone"], novo["email"],
                 novo["endereco_cep"], novo["endereco_rua"], novo["endereco_numero"],
                 novo["endereco_bairro"], novo["endereco_cidade"], novo["endereco_uf"]),
            )
            cur.execute("SELECT * FROM cliente WHERE id = %s", (cur.lastrowid,))
            cliente = cur.fetchone()

        # ---- a data está livre? ----
        cur.execute(
            f"""SELECT a.id, c.nome FROM aluguel a JOIN cliente c ON c.id = a.id_cliente
                WHERE a.status IN ({','.join(['%s'] * len(STATUS_OCUPAM))})
                  AND a.data_inicio_evento <= %s AND a.data_final_evento >= %s
                LIMIT 1""",
            (*STATUS_OCUPAM, r["data_final_evento"], r["data_inicio_evento"]),
        )
        conflito = cur.fetchone()
        if conflito:
            raise ErroValidacao(f"Essa data já está ocupada pela reserva nº {conflito['id']} "
                                f"({conflito['nome']}).", "data", 409)

        # ---- reserva ----
        cur.execute(
            """INSERT INTO aluguel (id_cliente, data_inicio_evento, data_final_evento, tipo_evento,
                 num_convidados, turno, status, valor_total, origem, registrado_por)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
            (cliente["id"], r["data_inicio_evento"], r["data_final_evento"], r["tipo_evento"],
             r["num_convidados"], r["turno"], r["status"], r["valor_total"], r["origem"], admin["id"]),
        )
        id_aluguel = cur.lastrowid

        if r["sinal"]:
            cur.execute(
                """INSERT INTO pagamento (id_aluguel, tipo, valor, forma_pagamento, status, data_pagamento)
                   VALUES (%s, 'sinal', %s, %s, 'pago', %s)""",
                (id_aluguel, r["sinal"]["valor"], r["sinal"]["forma"], r["sinal"]["data"]),
            )
        if r["observacao"]:
            cur.execute(
                "INSERT INTO observacoes (id_aluguel, autor, texto_observacao) VALUES (%s, 'equipe', %s)",
                (id_aluguel, r["observacao"]),
            )
    db.commit()
    return jsonify({"id": id_aluguel, "cliente": cliente_json(cliente), "status": r["status"]}), 201
