"""Área administrativa (/admin) — só para administradores.

Rotas:
  POST  /api/admin/login      { email, senha }
  POST /api/admin/logout
  GET  /api/admin/me
  GET  /api/admin/clientes?q=texto   → busca por nome, CPF ou telefone
  GET  /api/admin/reservas           → todas as reservas (até 300)
  POST /api/admin/reservas           → registra uma reserva feita fora do site
                                       (rede social, telefone, presencial)
  GET   /api/admin/reservas/<id>                 → detalhes: cliente, pagamentos, observações
  PATCH /api/admin/reservas/<id>                 → editar dados do evento, valor e status
  POST  /api/admin/reservas/<id>/cancelar        { motivo }
  POST  /api/admin/reservas/<id>/pagamentos      { tipo, valor, forma, data }
  POST  /api/admin/reservas/<id>/pagamentos/<pid>/estornar
  POST  /api/admin/reservas/<id>/observacoes     { texto }

O administrador é criado pelo comando:  python criar_admin.py
"""
import time
from datetime import date
from decimal import Decimal
from functools import wraps

from flask import Blueprint, current_app, jsonify, request, session
from werkzeug.security import check_password_hash

from auth import _tentativas_login, corpo_json, login_bloqueado
from db import get_db
from reservas import STATUS_OCUPAM
from validacao import (FORMAS_PAGAMENTO, ORIGENS_ADMIN, TIPOS_EVENTO, TURNOS, ErroValidacao, data_iso,
                       dinheiro, so_digitos, validar_cliente_admin, validar_reserva_admin)

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


# ================================================================ gestão de uma reserva
STATUS_TODOS = {"pendente", "aguardando_assinatura", "confirmado", "concluido", "cancelado"}
STATUS_EXIGEM_VALOR = {"aguardando_assinatura", "confirmado", "concluido"}   # mesma regra do banco
TIPOS_PAGAMENTO = {"sinal", "restante"}


def carregar_reserva(cur, id_aluguel, travar=False):
    cur.execute("SELECT * FROM aluguel WHERE id = %s" + (" FOR UPDATE" if travar else ""), (id_aluguel,))
    r = cur.fetchone()
    if not r:
        raise ErroValidacao("Reserva não encontrada.", status=404)
    return r


def total_pago(cur, id_aluguel) -> Decimal:
    cur.execute("SELECT COALESCE(SUM(valor), 0) AS t FROM pagamento WHERE id_aluguel = %s AND status = 'pago'",
                (id_aluguel,))
    return Decimal(cur.fetchone()["t"])


def checar_data_livre(cur, id_aluguel, inicio, fim):
    cur.execute(
        f"""SELECT a.id, c.nome FROM aluguel a JOIN cliente c ON c.id = a.id_cliente
            WHERE a.id <> %s AND a.status IN ({','.join(['%s'] * len(STATUS_OCUPAM))})
              AND a.data_inicio_evento <= %s AND a.data_final_evento >= %s
            LIMIT 1""",
        (id_aluguel, *STATUS_OCUPAM, fim, inicio),
    )
    conflito = cur.fetchone()
    if conflito:
        raise ErroValidacao(f"Essa data já está ocupada pela reserva nº {conflito['id']} ({conflito['nome']}).",
                            "data", 409)


def dinheiro_txt(v):
    return None if v is None else str(Decimal(v).quantize(Decimal("0.01")))


@bp.get("/reservas/<int:id_aluguel>")
@exige_admin
def detalhes_reserva(admin, id_aluguel):
    with get_db().cursor() as cur:
        r = carregar_reserva(cur, id_aluguel)
        cur.execute("SELECT * FROM cliente WHERE id = %s", (r["id_cliente"],))
        c = cur.fetchone()
        cur.execute("SELECT nome FROM administrador WHERE id = %s", (r["registrado_por"],))
        reg = cur.fetchone()
        cur.execute("SELECT * FROM pagamento WHERE id_aluguel = %s ORDER BY COALESCE(data_pagamento, '9999-12-31'), id",
                    (id_aluguel,))
        pagamentos = cur.fetchall()
        cur.execute("SELECT * FROM observacoes WHERE id_aluguel = %s ORDER BY data_criacao, id", (id_aluguel,))
        obs = cur.fetchall()
        pago = total_pago(cur, id_aluguel)

    return jsonify({
        "id": r["id"], "status": r["status"], "origem": r["origem"], "tipo_evento": r["tipo_evento"],
        "data_inicio_evento": r["data_inicio_evento"].isoformat(),
        "data_final_evento": r["data_final_evento"].isoformat(),
        "turno": r["turno"], "num_convidados": r["num_convidados"],
        "valor_total": dinheiro_txt(r["valor_total"]),
        "total_pago": dinheiro_txt(pago),
        "falta_pagar": dinheiro_txt(r["valor_total"] - pago) if r["valor_total"] is not None else None,
        "data_solicitacao": r["data_solicitacao"].isoformat(sep=" ", timespec="minutes"),
        "registrado_por": reg["nome"] if reg else None,
        "cliente": {
            **cliente_json(c), "data_nascimento": c["data_nascimento"].isoformat(),
            "endereco": f"{c['endereco_rua']}, {c['endereco_numero']} — {c['endereco_bairro']}, "
                        f"{c['endereco_cidade']}/{c['endereco_uf']} · CEP {c['endereco_cep'][:5]}-{c['endereco_cep'][5:]}",
        },
        "pagamentos": [{
            "id": p["id"], "tipo": p["tipo"], "valor": dinheiro_txt(p["valor"]), "forma": p["forma_pagamento"],
            "status": p["status"], "data": p["data_pagamento"].date().isoformat() if p["data_pagamento"] else None,
        } for p in pagamentos],
        "observacoes": [{
            "id": o["id"], "autor": o["autor"], "texto": o["texto_observacao"],
            "data": o["data_criacao"].isoformat(sep=" ", timespec="minutes"),
        } for o in obs],
    })


@bp.patch("/reservas/<int:id_aluguel>")
@exige_admin
def editar_reserva(admin, id_aluguel):
    """Edita dados do evento, valor e/ou status. Campos não enviados ficam como estão."""
    d = corpo_json()
    db = get_db()
    with db.cursor() as cur:
        atual = carregar_reserva(cur, id_aluguel, travar=True)

        tipo = d.get("tipo_evento", atual["tipo_evento"])
        if tipo not in TIPOS_EVENTO:
            raise ErroValidacao("Selecione o tipo de evento.", "tipo")

        origem = d.get("origem", atual["origem"])
        if origem not in ORIGENS_ADMIN | {"site"} or (origem == "site" and atual["origem"] != "site"):
            raise ErroValidacao("Origem inválida.", "origem")

        inicio = data_iso(d["data_inicio_evento"], "data") if "data_inicio_evento" in d else atual["data_inicio_evento"]
        final = data_iso(d["data_final_evento"], "data") if "data_final_evento" in d else atual["data_final_evento"]
        datas_mudaram = (inicio, final) != (atual["data_inicio_evento"], atual["data_final_evento"])
        if final < inicio:
            raise ErroValidacao("O último dia não pode ser antes do primeiro.", "data")
        if datas_mudaram and inicio < date.today():
            raise ErroValidacao("A nova data já passou.", "data")

        if final == inicio:
            turno = d.get("turno", atual["turno"])
            if turno not in TURNOS:
                raise ErroValidacao("Selecione o turno.", "turno")
        else:
            turno = None

        try:
            convidados = int(d.get("num_convidados", atual["num_convidados"]))
        except (TypeError, ValueError):
            raise ErroValidacao("Informe o número de convidados.", "convidados")
        maximo = current_app.config["CONVIDADOS_MAX"]
        if not 1 <= convidados <= maximo:
            raise ErroValidacao(f"O número de convidados deve ser entre 1 e {maximo}.", "convidados")

        status = d.get("status", atual["status"])
        if status == "cancelado" and atual["status"] != "cancelado":
            raise ErroValidacao("Para cancelar, use o botão \"Cancelar reserva\" (ele pede o motivo).", "status")
        if status not in STATUS_TODOS:
            raise ErroValidacao("Status inválido.", "status")
        if status == "concluido" and final >= date.today():
            raise ErroValidacao("Só dá para marcar como concluída depois do último dia do evento.", "status")

        valor = dinheiro(d["valor_total"], "valor_total", obrigatorio=False) if "valor_total" in d else atual["valor_total"]
        if status in STATUS_EXIGEM_VALOR and valor is None:
            raise ErroValidacao("Informe o valor total para esse status.", "valor_total")
        pago = total_pago(cur, id_aluguel)
        if valor is not None and valor < pago:
            raise ErroValidacao(f"O valor total não pode ser menor que o já pago (R$ {pago}).", "valor_total")
        if valor is None and pago > 0:
            raise ErroValidacao("Esta reserva já tem pagamentos; o valor total não pode ficar vazio.", "valor_total")

        if status in STATUS_OCUPAM:
            checar_data_livre(cur, id_aluguel, inicio, final)

        cur.execute(
            """UPDATE aluguel SET tipo_evento = %s, origem = %s, data_inicio_evento = %s, data_final_evento = %s,
                 turno = %s, num_convidados = %s, status = %s, valor_total = %s
               WHERE id = %s""",
            (tipo, origem, inicio, final, turno, convidados, status, valor, id_aluguel),
        )
        if status != atual["status"]:
            rotulo = {"pendente": "pendente", "aguardando_assinatura": "aguardando assinatura",
                      "confirmado": "confirmado", "concluido": "concluído", "cancelado": "cancelado"}
            cur.execute("INSERT INTO observacoes (id_aluguel, autor, texto_observacao) VALUES (%s, 'equipe', %s)",
                        (id_aluguel, f"Status alterado de \"{rotulo[atual['status']]}\" para "
                                     f"\"{rotulo[status]}\" por {admin['nome']}."))
    db.commit()
    return detalhes_reserva.__wrapped__(admin, id_aluguel)


@bp.post("/reservas/<int:id_aluguel>/cancelar")
@exige_admin
def cancelar_reserva(admin, id_aluguel):
    motivo = str(corpo_json().get("motivo") or "").strip()
    if len(motivo) < 3:
        raise ErroValidacao("Informe o motivo do cancelamento.", "motivo")
    if len(motivo) > 1000:
        raise ErroValidacao("O motivo pode ter no máximo 1000 caracteres.", "motivo")
    db = get_db()
    with db.cursor() as cur:
        r = carregar_reserva(cur, id_aluguel, travar=True)
        if r["status"] == "cancelado":
            raise ErroValidacao("Esta reserva já está cancelada.", status=409)
        if r["status"] == "concluido":
            raise ErroValidacao("Uma reserva concluída não pode ser cancelada.", status=409)
        cur.execute("UPDATE aluguel SET status = 'cancelado' WHERE id = %s", (id_aluguel,))
        cur.execute("INSERT INTO observacoes (id_aluguel, autor, texto_observacao) VALUES (%s, 'equipe', %s)",
                    (id_aluguel, f"Reserva cancelada por {admin['nome']}. Motivo: {motivo}"))
    db.commit()
    return detalhes_reserva.__wrapped__(admin, id_aluguel)


@bp.post("/reservas/<int:id_aluguel>/pagamentos")
@exige_admin
def registrar_pagamento(admin, id_aluguel):
    d = corpo_json()
    tipo = str(d.get("tipo") or "")
    if tipo not in TIPOS_PAGAMENTO:
        raise ErroValidacao("Selecione se é o sinal ou o restante.", "pg_tipo")
    valor = dinheiro(d.get("valor"), "pg_valor")
    forma = str(d.get("forma") or "")
    if forma not in FORMAS_PAGAMENTO:
        raise ErroValidacao("Selecione a forma de pagamento.", "pg_forma")
    data_pg = data_iso(d.get("data") or date.today().isoformat(), "pg_data", "Data do pagamento inválida.")
    if data_pg > date.today():
        raise ErroValidacao("A data do pagamento não pode ser no futuro.", "pg_data")

    db = get_db()
    with db.cursor() as cur:
        r = carregar_reserva(cur, id_aluguel, travar=True)
        if r["status"] == "cancelado":
            raise ErroValidacao("Reserva cancelada não recebe pagamentos.", status=409)
        if tipo == "sinal":
            cur.execute("SELECT 1 FROM pagamento WHERE id_aluguel = %s AND tipo = 'sinal' AND status = 'pago'",
                        (id_aluguel,))
            if cur.fetchone():
                raise ErroValidacao("O sinal desta reserva já foi registrado. Use \"Restante\".", "pg_tipo", 409)
        if r["valor_total"] is None:
            if tipo == "restante":
                raise ErroValidacao("Defina o valor total da reserva antes de registrar o restante.", "pg_valor")
        else:
            falta = r["valor_total"] - total_pago(cur, id_aluguel)
            if falta <= 0:
                raise ErroValidacao("Esta reserva já está totalmente paga.", "pg_valor", 409)
            if valor > falta:
                raise ErroValidacao(f"O valor passa do que falta pagar (R$ {falta}).", "pg_valor")
        cur.execute(
            """INSERT INTO pagamento (id_aluguel, tipo, valor, forma_pagamento, status, data_pagamento)
               VALUES (%s, %s, %s, %s, 'pago', %s)""",
            (id_aluguel, tipo, valor, forma, data_pg),
        )
    db.commit()
    return detalhes_reserva.__wrapped__(admin, id_aluguel), 201


@bp.post("/reservas/<int:id_aluguel>/pagamentos/<int:id_pagamento>/estornar")
@exige_admin
def estornar_pagamento(admin, id_aluguel, id_pagamento):
    """Marca um pagamento como estornado (ex.: lançado errado ou devolvido)."""
    db = get_db()
    with db.cursor() as cur:
        carregar_reserva(cur, id_aluguel, travar=True)
        cur.execute("SELECT * FROM pagamento WHERE id = %s AND id_aluguel = %s", (id_pagamento, id_aluguel))
        p = cur.fetchone()
        if not p:
            raise ErroValidacao("Pagamento não encontrado.", status=404)
        if p["status"] != "pago":
            raise ErroValidacao("Este pagamento já foi estornado.", status=409)
        cur.execute("UPDATE pagamento SET status = 'estornado' WHERE id = %s", (id_pagamento,))
        cur.execute("INSERT INTO observacoes (id_aluguel, autor, texto_observacao) VALUES (%s, 'equipe', %s)",
                    (id_aluguel, f"Pagamento de R$ {p['valor']} ({p['tipo']}) estornado por {admin['nome']}."))
    db.commit()
    return detalhes_reserva.__wrapped__(admin, id_aluguel)


@bp.post("/reservas/<int:id_aluguel>/observacoes")
@exige_admin
def adicionar_observacao(admin, id_aluguel):
    texto = str(corpo_json().get("texto") or "").strip()
    if not texto:
        raise ErroValidacao("Escreva a observação.", "obs_texto")
    if len(texto) > 2000:
        raise ErroValidacao("A observação pode ter no máximo 2000 caracteres.", "obs_texto")
    db = get_db()
    with db.cursor() as cur:
        carregar_reserva(cur, id_aluguel)
        cur.execute("INSERT INTO observacoes (id_aluguel, autor, texto_observacao) VALUES (%s, 'equipe', %s)",
                    (id_aluguel, f"{texto} — {admin['nome']}"))
    db.commit()
    return detalhes_reserva.__wrapped__(admin, id_aluguel), 201
