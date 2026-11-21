"""Calendário e pedidos de reserva.

Rotas (as mesmas que o site chama em assets/reserva.js):
  GET  /api/datas-ocupadas → reservas que ocupam a data (aguardando assinatura,
                             confirmadas ou concluídas), de hoje em diante
  POST /api/reservas       → cria o pedido (status "pendente"); exige login
"""
from flask import Blueprint, current_app, jsonify, request

from auth import cliente_logado, corpo_json
from db import get_db
from validacao import ErroValidacao, validar_reserva

bp = Blueprint("reservas", __name__, url_prefix="/api")

# Status que bloqueiam a data no calendário (o mesmo critério do trigger do banco).
STATUS_OCUPAM = ("aguardando_assinatura", "confirmado", "concluido")


@bp.get("/datas-ocupadas")
def datas_ocupadas():
    with get_db().cursor() as cur:
        cur.execute("SELECT data_inicio_evento, data_final_evento FROM vw_datas_ocupadas "
                    "ORDER BY data_inicio_evento")
        linhas = cur.fetchall()
    return jsonify([
        {"data_inicio_evento": r["data_inicio_evento"].isoformat(),
         "data_final_evento": r["data_final_evento"].isoformat()}
        for r in linhas
    ])


@bp.post("/reservas")
def criar_reserva():
    cliente = cliente_logado()
    if not cliente:
        raise ErroValidacao("Entre na sua conta para enviar o pedido.", status=401)

    r = validar_reserva(corpo_json(), current_app.config["CONVIDADOS_MAX"])
    db = get_db()
    with db.cursor() as cur:
        # A data já está ocupada? (pedidos pendentes não bloqueiam — a equipe decide)
        cur.execute(
            f"""SELECT 1 FROM aluguel
                WHERE status IN ({','.join(['%s'] * len(STATUS_OCUPAM))})
                  AND data_inicio_evento <= %s AND data_final_evento >= %s
                LIMIT 1""",
            (*STATUS_OCUPAM, r["data_final_evento"], r["data_inicio_evento"]),
        )
        if cur.fetchone():
            raise ErroValidacao("Essa data acabou de ser reservada. Escolha outra no calendário.", "data", 409)

        # valor_total fica NULL: a equipe define o orçamento na etapa de visita.
        cur.execute(
            """INSERT INTO aluguel (id_cliente, data_inicio_evento, data_final_evento, tipo_evento,
                 num_convidados, turno, status)
               VALUES (%s, %s, %s, %s, %s, %s, 'pendente')""",
            (cliente["id"], r["data_inicio_evento"], r["data_final_evento"], r["tipo_evento"],
             r["num_convidados"], r["turno"]),
        )
        id_aluguel = cur.lastrowid

        # O formulário deixa informar outro WhatsApp para este evento; como o
        # aluguel não tem coluna própria, ele vai como observação para a equipe.
        notas = []
        if r["whatsapp"] and r["whatsapp"] != cliente["telefone"]:
            notas.append(f"WhatsApp de contato para este evento: {r['whatsapp']}")
        if r["mensagem"]:
            notas.append(r["mensagem"])
        for texto in notas:
            cur.execute(
                "INSERT INTO observacoes (id_aluguel, autor, texto_observacao) VALUES (%s, 'cliente', %s)",
                (id_aluguel, texto),
            )
    db.commit()
    return jsonify({"id": id_aluguel, "status": "pendente"}), 201
