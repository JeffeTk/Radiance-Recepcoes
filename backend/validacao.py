"""Validações — as mesmas regras do site (main.js / reserva.js) e do banco.

O site já valida antes de enviar, mas o servidor valida de novo:
qualquer pessoa pode chamar a API direto, sem passar pelo site.
"""
import re
from datetime import date
from decimal import Decimal, InvalidOperation

UFS = {
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
    "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
}
TIPOS_EVENTO = {"Casamento", "Debutante (15 anos)", "Aniversário", "Corporativo", "Outro"}
TURNOS = {"Diurno", "Noturno"}

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")


class ErroValidacao(Exception):
    """Erro com mensagem para o usuário e o campo do formulário (quando houver)."""

    def __init__(self, mensagem, campo=None, status=400):
        super().__init__(mensagem)
        self.mensagem = mensagem
        self.campo = campo
        self.status = status


def so_digitos(v) -> str:
    return re.sub(r"\D", "", str(v or ""))


def texto(dados, chave, campo=None, minimo=1, maximo=255, msg=None):
    v = str(dados.get(chave) or "").strip()
    if len(v) < minimo or len(v) > maximo:
        raise ErroValidacao(msg or "Campo obrigatório.", campo or chave)
    return v


def cpf_valido(cpf: str) -> bool:
    c = so_digitos(cpf)
    if len(c) != 11 or c == c[0] * 11:
        return False
    for t in (9, 10):
        soma = sum(int(c[i]) * (t + 1 - i) for i in range(t))
        if (soma * 10 % 11) % 10 != int(c[t]):
            return False
    return True


def telefone_valido(tel: str) -> bool:
    d = so_digitos(tel)
    if len(d) not in (10, 11):
        return False
    if not 11 <= int(d[:2]) <= 99:
        return False
    if len(d) == 11 and d[2] != "9":  # celular começa com 9
        return False
    return True


def idade(nasc: date, hoje: date = None) -> int:
    hoje = hoje or date.today()
    return hoje.year - nasc.year - ((hoje.month, hoje.day) < (nasc.month, nasc.day))


def data_iso(v, campo, msg="Data inválida."):
    try:
        return date.fromisoformat(str(v))
    except (TypeError, ValueError):
        raise ErroValidacao(msg, campo)


def senha_forte(s: str) -> bool:
    return len(s) >= 8 and re.search(r"[A-Za-z]", s) and re.search(r"\d", s)


def validar_endereco(end) -> dict:
    if not isinstance(end, dict):
        raise ErroValidacao("Endereço inválido.", "rua")
    cep = so_digitos(end.get("cep"))
    if len(cep) != 8:
        raise ErroValidacao("Informe o CEP com 8 números.", "cep")
    rua = texto(end, "rua", minimo=3, maximo=150, msg="Informe a rua.")
    numero = texto(end, "numero", maximo=10, msg="Informe o número (ou S/N).")
    bairro = texto(end, "bairro", minimo=2, maximo=80, msg="Informe o bairro.")
    cidade = texto(end, "cidade", minimo=2, maximo=80, msg="Informe a cidade.")
    uf = str(end.get("uf") or "").strip().upper()
    if uf not in UFS:
        raise ErroValidacao("Selecione a UF.", "uf")
    return {"endereco_cep": cep, "endereco_rua": rua, "endereco_numero": numero,
            "endereco_bairro": bairro, "endereco_cidade": cidade, "endereco_uf": uf}


def validar_pessoa(d: dict) -> dict:
    """Nome, CPF, nascimento (18+) e telefone — comuns ao site e ao admin."""
    nome = texto(d, "nome", maximo=120, msg="Informe nome e sobrenome.")
    if len(nome.split()) < 2:
        raise ErroValidacao("Informe nome e sobrenome.", "nome")

    cpf = so_digitos(d.get("cpf"))
    if not cpf_valido(cpf):
        raise ErroValidacao("CPF inválido.", "cpf")

    nasc = data_iso(d.get("data_nascimento"), "nascimento", "Informe sua data de nascimento.")
    anos = idade(nasc)
    if anos < 18:
        raise ErroValidacao("É preciso ter 18 anos ou mais para contratar.", "nascimento")
    if anos > 120:
        raise ErroValidacao("Data de nascimento inválida.", "nascimento")

    telefone = so_digitos(d.get("telefone"))
    if not telefone_valido(telefone):
        raise ErroValidacao("Informe um número válido com DDD.", "telefone")
    return {"nome": nome, "cpf": cpf, "data_nascimento": nasc.isoformat(), "telefone": telefone}


def validar_cadastro(d: dict) -> dict:
    """Valida o JSON do cadastro feito pelo site e devolve os dados limpos."""
    pessoa = validar_pessoa(d)

    email = str(d.get("email") or "").strip().lower()
    if not EMAIL_RE.match(email) or len(email) > 150:
        raise ErroValidacao("Informe um e-mail válido.", "email")

    senha = str(d.get("senha") or "")
    if not senha_forte(senha) or len(senha) > 200:
        raise ErroValidacao("Use no mínimo 8 caracteres, com letras e números.", "senha")

    return {**pessoa, "email": email, "senha": senha, **validar_endereco(d.get("endereco") or {})}


def validar_reserva(d: dict, convidados_max: int) -> dict:
    """Valida o JSON do pedido de reserva e devolve os dados limpos."""
    tipo = str(d.get("tipo_evento") or "")
    if tipo not in TIPOS_EVENTO:
        raise ErroValidacao("Selecione o tipo de evento.", "tipo")

    inicio = data_iso(d.get("data_inicio_evento"), "data", "Selecione a data do evento no calendário.")
    final = data_iso(d.get("data_final_evento") or d.get("data_inicio_evento"), "data")
    if inicio < date.today():
        raise ErroValidacao("A data do evento já passou.", "data")
    if final < inicio:
        raise ErroValidacao("A data final não pode ser antes da data inicial.", "data")

    if final == inicio:
        turno = d.get("turno")
        if turno not in TURNOS:
            raise ErroValidacao("Selecione o turno.", "turno")
    else:
        turno = None  # mais de um dia: ocupa diurno e noturno

    try:
        convidados = int(d.get("num_convidados"))
    except (TypeError, ValueError):
        raise ErroValidacao("Informe o número de convidados.", "convidados")
    if not 1 <= convidados <= convidados_max:
        raise ErroValidacao(f"O número de convidados deve ser entre 1 e {convidados_max}.", "convidados")

    whatsapp = so_digitos(d.get("whatsapp"))
    if whatsapp and not telefone_valido(whatsapp):
        raise ErroValidacao("Informe um número de WhatsApp válido com DDD.", "whatsapp")

    mensagem = str(d.get("mensagem") or "").strip()
    if len(mensagem) > 2000:
        raise ErroValidacao("As observações podem ter no máximo 2000 caracteres.", "mensagem")

    return {
        "tipo_evento": tipo, "data_inicio_evento": inicio, "data_final_evento": final,
        "turno": turno, "num_convidados": convidados, "whatsapp": whatsapp, "mensagem": mensagem,
    }


# ------------------------------------------------------------------ área administrativa
ORIGENS_ADMIN = {"presencial", "whatsapp", "instagram", "facebook", "telefone", "outro"}
STATUS_ADMIN = {"pendente", "aguardando_assinatura", "confirmado"}
FORMAS_PAGAMENTO = {"pix", "cartao_credito", "cartao_debito", "boleto", "dinheiro"}


def dinheiro(v, campo, obrigatorio=True):
    """Aceita 3500, 3500.5, "3500,50" ou "3.500,50" e devolve Decimal com 2 casas."""
    if v in (None, ""):
        if obrigatorio:
            raise ErroValidacao("Informe o valor.", campo)
        return None
    txt = str(v).strip().replace("R$", "").replace(" ", "")
    if "," in txt:                       # formato brasileiro
        txt = txt.replace(".", "").replace(",", ".")
    try:
        valor = Decimal(txt).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        raise ErroValidacao("Valor inválido.", campo)
    if valor <= 0 or valor > Decimal("99999999.99"):
        raise ErroValidacao("Valor inválido.", campo)
    return valor


def validar_cliente_admin(d: dict) -> dict:
    """Cliente cadastrado pela equipe: sem senha, e-mail opcional."""
    dados = validar_pessoa(d)
    email = str(d.get("email") or "").strip().lower()
    if email and (not EMAIL_RE.match(email) or len(email) > 150):
        raise ErroValidacao("E-mail inválido (ou deixe em branco).", "email")
    return {**dados, "email": email or None, **validar_endereco(d.get("endereco") or {})}


def validar_reserva_admin(d: dict, convidados_max: int) -> dict:
    """Reserva lançada pela equipe (rede social, telefone, presencial)."""
    r = validar_reserva(d, convidados_max)

    origem = str(d.get("origem") or "")
    if origem not in ORIGENS_ADMIN:
        raise ErroValidacao("Selecione por onde a reserva foi feita.", "origem")

    status = str(d.get("status") or "pendente")
    if status not in STATUS_ADMIN:
        raise ErroValidacao("Status inválido.", "status")

    valor_total = dinheiro(d.get("valor_total"), "valor_total", obrigatorio=(status != "pendente"))

    sinal = None
    s = d.get("sinal")
    if s:
        if not isinstance(s, dict):
            raise ErroValidacao("Dados do sinal inválidos.", "sinal_valor")
        valor = dinheiro(s.get("valor"), "sinal_valor")
        if valor_total is not None and valor > valor_total:
            raise ErroValidacao("O sinal não pode ser maior que o valor total.", "sinal_valor")
        forma = str(s.get("forma") or "")
        if forma not in FORMAS_PAGAMENTO:
            raise ErroValidacao("Selecione a forma de pagamento do sinal.", "sinal_forma")
        data_pg = data_iso(s.get("data") or date.today().isoformat(), "sinal_data", "Data do pagamento inválida.")
        if data_pg > date.today():
            raise ErroValidacao("A data do pagamento não pode ser no futuro.", "sinal_data")
        sinal = {"valor": valor, "forma": forma, "data": data_pg}

    observacao = str(d.get("observacao") or "").strip()
    if len(observacao) > 2000:
        raise ErroValidacao("As observações podem ter no máximo 2000 caracteres.", "observacao")

    r.update({"origem": origem, "status": status, "valor_total": valor_total,
              "sinal": sinal, "observacao": observacao})
    return r
