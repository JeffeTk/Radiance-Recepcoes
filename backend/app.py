"""Radiance Recepções e Eventos — servidor (Flask).

Serve as páginas do site (pasta ../site) e a API em /api/*.
Para rodar em desenvolvimento:  python app.py   (detalhes no README.md)
"""
import pymysql
from flask import Flask, abort, jsonify, request, send_from_directory

import auth
import db
import reservas
from config import Config
from validacao import ErroValidacao

PAGINAS = {"index.html", "reserva.html"}


def create_app(config=Config):
    app = Flask(__name__, static_folder=None)
    app.config.from_object(config)
    if not app.config["SECRET_KEY"]:
        raise RuntimeError("Defina SECRET_KEY no arquivo .env (veja o README).")

    db.init_app(app)
    app.register_blueprint(auth.bp)
    app.register_blueprint(reservas.bp)

    # -------- proteção contra CSRF --------
    # A API só aceita POST com JSON. Um site malicioso não consegue mandar
    # JSON para cá sem o navegador bloquear (CORS), e o cookie de sessão é
    # SameSite=Lax — juntos, isso impede ações em nome do cliente logado.
    @app.before_request
    def exigir_json():
        if request.path.startswith("/api/") and request.method == "POST" and request.path != "/api/logout":
            if not request.is_json:
                return jsonify({"mensagem": "Envie os dados em JSON."}), 415

    # -------- erros em JSON, no formato que o site espera --------
    @app.errorhandler(ErroValidacao)
    def erro_validacao(e):
        corpo = {"mensagem": e.mensagem}
        if e.campo:
            corpo["campo"] = e.campo
        return jsonify(corpo), e.status

    @app.errorhandler(pymysql.err.OperationalError)
    def erro_banco(e):
        app.logger.exception("Erro de conexão com o banco")
        return jsonify({"mensagem": "Serviço indisponível no momento. Tente novamente em instantes."}), 503

    @app.errorhandler(Exception)
    def erro_inesperado(e):
        from werkzeug.exceptions import HTTPException
        if isinstance(e, HTTPException):
            if request.path.startswith("/api/"):
                return jsonify({"mensagem": e.description}), e.code
            return e
        app.logger.exception("Erro inesperado")
        return jsonify({"mensagem": "Não foi possível concluir agora. Tente novamente."}), 500

    # -------- páginas do site --------
    site = app.config["SITE_DIR"]

    @app.get("/")
    def inicio():
        return send_from_directory(site, "index.html")

    @app.get("/<pagina>")
    def pagina(pagina):
        if pagina not in PAGINAS:
            abort(404)
        return send_from_directory(site, pagina)

    @app.get("/assets/<path:arquivo>")
    def assets(arquivo):
        return send_from_directory(site / "assets", arquivo)

    @app.after_request
    def cabecalhos(resp):
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("Referrer-Policy", "same-origin")
        if request.path.startswith("/api/"):
            resp.headers["Cache-Control"] = "no-store"
        return resp

    return app


app = create_app()

if __name__ == "__main__":
    app.run(debug=True, port=5000)
