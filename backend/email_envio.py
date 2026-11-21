"""Envio do código de verificação por e-mail (SMTP)."""
import smtplib
import ssl
from email.message import EmailMessage

from flask import current_app


def enviar_codigo(destinatario: str, nome: str, codigo: str) -> None:
    c = current_app.config
    primeiro_nome = nome.split()[0] if nome else ""
    assunto = f"{codigo} é o seu código de verificação — Radiance"
    texto = (
        f"Olá, {primeiro_nome}!\n\n"
        f"Seu código para confirmar o e-mail na Radiance Recepções e Eventos é:\n\n"
        f"    {codigo}\n\n"
        f"Ele vale por {c['CODIGO_VALIDADE_MIN']} minutos. "
        "Se você não pediu este cadastro, ignore esta mensagem.\n\n"
        "Radiance Recepções e Eventos"
    )
    html = f"""\
<div style="font-family:Arial,sans-serif;color:#24211B;max-width:480px">
  <p>Olá, {primeiro_nome}!</p>
  <p>Seu código para confirmar o e-mail na <b>Radiance Recepções e Eventos</b> é:</p>
  <p style="font-size:30px;letter-spacing:8px;font-weight:bold;color:#6B2430">{codigo}</p>
  <p>Ele vale por {c['CODIGO_VALIDADE_MIN']} minutos. Se você não pediu este cadastro, ignore esta mensagem.</p>
</div>"""

    if not c["SMTP_HOST"]:
        # Desenvolvimento: sem SMTP configurado, mostra o código no terminal.
        current_app.logger.warning("[SMTP não configurado] Código para %s: %s", destinatario, codigo)
        return

    msg = EmailMessage()
    msg["Subject"] = assunto
    msg["From"] = c["SMTP_FROM"]
    msg["To"] = destinatario
    msg.set_content(texto)
    msg.add_alternative(html, subtype="html")

    contexto = ssl.create_default_context()
    if c["SMTP_SSL"]:
        with smtplib.SMTP_SSL(c["SMTP_HOST"], c["SMTP_PORT"], context=contexto, timeout=15) as s:
            if c["SMTP_USER"]:
                s.login(c["SMTP_USER"], c["SMTP_PASSWORD"])
            s.send_message(msg)
    else:
        with smtplib.SMTP(c["SMTP_HOST"], c["SMTP_PORT"], timeout=15) as s:
            s.starttls(context=contexto)
            if c["SMTP_USER"]:
                s.login(c["SMTP_USER"], c["SMTP_PASSWORD"])
            s.send_message(msg)
