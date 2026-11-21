# Guia de instalação — Radiance Recepções e Eventos

← [Voltar ao README](../README.md)

```
radiance/
├── .devcontainer/        configuração do GitHub Codespaces (Python + MySQL prontos)
├── site/                 páginas (index.html, reserva.html) e assets/ (CSS e JS)
├── backend/              servidor em Python + Flask (API em /api/* e as páginas do site)
│   ├── app.py            ponto de entrada
│   ├── auth.py           cadastro com código por e-mail, login, logout, sessão
│   ├── reservas.py       datas ocupadas e pedidos de reserva
│   ├── validacao.py      regras de validação (as mesmas do site)
│   ├── email_envio.py    envio do código por SMTP
│   ├── config.py, db.py
│   ├── requirements.txt
│   └── .env.example      modelo de configuração
└── banco/
    └── radiance_banco.sql   cria o banco (tabelas, regras e trigger)
```

O site funciona de três jeitos:

- **Aberto direto do arquivo** (duplo clique no `index.html`): **modo de teste**. Nada vai para o servidor. As contas ficam só na aba do navegador, o código do e-mail aparece na tela e o calendário mostra datas de exemplo.
- **Aberto pelo servidor** (`http://localhost:5000`): usa o back-end e o banco de verdade.
- **No GitHub Codespaces:** igual ao anterior, mas na nuvem, sem instalar nada. Veja a seção logo abaixo.

---

## Rodar pelo GitHub Codespaces (sem instalar nada)

O projeto já vem configurado para o **GitHub Codespaces** (pasta `.devcontainer/`). O GitHub cria uma máquina na nuvem com Python e MySQL, monta o banco e inicia o site sozinho. Você usa tudo pelo navegador.

### Primeira vez

1. **Crie um repositório no GitHub** (pode ser privado) e envie **todos os arquivos desta pasta**, incluindo a pasta `.devcontainer`.
   - Pelo site: *Add file → Upload files* e arraste o conteúdo da pasta. Pastas que começam com ponto (`.devcontainer`) às vezes não aparecem no explorador de arquivos. No Windows, ative "Itens ocultos" na aba *Exibir*.
   - Ou pelo terminal, com Git:
     ```bash
     git init
     git add .
     git commit -m "Radiance: site + back-end"
     git branch -M main
     git remote add origin https://github.com/SEU-USUARIO/radiance.git
     git push -u origin main
     ```
2. No repositório, clique em **Code → aba Codespaces → Create codespace on main**.
3. Espere de 2 a 4 minutos na primeira vez. O GitHub baixa o MySQL, cria o banco, instala as dependências e gera o `backend/.env` sozinho.
4. Quando o terminal mostrar `Iniciando o site em http://localhost:5000`, abra a aba **PORTAS** (*PORTS*), passe o mouse em **Site Radiance (5000)** e clique no ícone do **globo**. O site abre numa aba nova.

> **Código de verificação do cadastro:** aparece **no terminal** do Codespace, em uma linha como `Código para voce@email.com: 482913`. Para receber por e-mail, preencha o SMTP no `backend/.env` (veja a parte do Gmail mais abaixo) e reinicie o servidor.

### Nas próximas vezes

Abra o Codespace em **Code → Codespaces** ou em [github.com/codespaces](https://github.com/codespaces). O site inicia sozinho, e os dados do banco (contas, reservas) continuam lá.

### Coisas úteis

- **Reiniciar o servidor:** no terminal, aperte `Ctrl+C` e rode `bash .devcontainer/iniciar.sh`.
- **Mexer no banco** (por exemplo, aprovar uma reserva):
  ```bash
  mysql -h db -u radiance -pradiance-dev radiance
  ```
  ```sql
  UPDATE aluguel SET status = 'confirmado', valor_total = 3500.00 WHERE id = 1;
  ```
  Se o comando `mysql` não existir, instale com `sudo apt-get update && sudo apt-get install -y default-mysql-client`.
- **Mostrar o site para alguém:** na aba PORTAS, clique com o botão direito em *Site Radiance* → *Visibilidade da porta* → **Público** e mande o link.
  - Antes, troque `FLASK_DEBUG=1` por `FLASK_DEBUG=0` no `backend/.env` e reinicie o servidor. O modo de desenvolvimento tem um console de depuração que não deve ficar aberto para outras pessoas.
  - O link só funciona enquanto o Codespace estiver ligado.
- **Desligar:** o Codespace desliga sozinho depois de um tempo parado. Para desligar na hora, use *Code → Codespaces → ... → Stop codespace*. Contas gratuitas têm uma cota mensal de uso, que dá para acompanhar em *Settings → Billing*.
- **Recomeçar o banco do zero:** apague o Codespace e crie outro. O banco é recriado a partir de `banco/radiance_banco.sql`.

### Problemas comuns

- **"O banco não respondeu":** na primeira vez, o MySQL pode demorar. Espere um pouco e rode `bash .devcontainer/iniciar.sh` de novo.
- **A aba PORTAS não mostra a 5000:** o servidor não está rodando. Veja a mensagem de erro no terminal e rode `bash .devcontainer/iniciar.sh`.
- **Mudei o `radiance_banco.sql` e nada mudou:** o script só roda quando o banco é criado pela primeira vez. Crie um Codespace novo para aplicar.

---

## Rodar no seu computador

### 1. Requisitos

- Python 3.10 ou mais novo
- MySQL 8.0.16+ ou MariaDB 10.5+

### 2. Criar o banco

No terminal (ou cole o arquivo no MySQL Workbench e execute):

```bash
mysql -u root -p < banco/radiance_banco.sql
```

> Atenção: o script **apaga e recria** o banco `radiance`. Não rode de novo depois que o site estiver em uso.

Crie um usuário só para o site, sem poder de apagar tabelas:

```sql
CREATE USER 'radiance'@'localhost' IDENTIFIED BY 'troque-esta-senha';
GRANT SELECT, INSERT, UPDATE, DELETE ON radiance.* TO 'radiance'@'localhost';
FLUSH PRIVILEGES;
```

### 3. Instalar e configurar o back-end

```bash
cd backend
python -m venv .venv
# Windows:  .venv\Scripts\activate
# Linux/Mac: source .venv/bin/activate
pip install -r requirements.txt
```

Copie `.env.example` para `.env` e preencha:

- `SECRET_KEY`: gere uma com `python -c "import secrets; print(secrets.token_hex(32))"`. Se ela mudar, todos são deslogados e os códigos pendentes deixam de valer.
- `DB_USER` e `DB_PASSWORD`: o usuário criado no passo 2.
- `SMTP_*`: deixe `SMTP_HOST` vazio por enquanto. O código de verificação vai aparecer **no terminal**.

> O `.env` tem senhas. Não envie esse arquivo para o GitHub (já está no `.gitignore`).

### 4. Rodar

```bash
python app.py
```

Abra **http://localhost:5000**. Para testar o cadastro, crie uma conta e copie o código que aparece no terminal:

```
[SMTP não configurado] Código para voce@email.com: 482913
```

### 5. Enviar o e-mail de verdade (Gmail)

1. Na conta Google, ative a **verificação em duas etapas**.
2. Crie uma **senha de app** em *Conta Google → Segurança → Senhas de app*.
3. No `.env`:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SSL=false
SMTP_USER=radiance.recepcoes@gmail.com
SMTP_PASSWORD=a-senha-de-app-de-16-letras
SMTP_FROM=Radiance Recepções e Eventos <radiance.recepcoes@gmail.com>
```

Outros provedores, como Brevo, Mailgun, Zoho ou o e-mail da hospedagem, funcionam do mesmo jeito: basta trocar host, porta e login.

### 6. Colocar no ar (produção)

- Use um servidor de produção, não o `python app.py`:
  ```bash
  gunicorn -w 2 -b 0.0.0.0:8000 app:app
  ```
  (Render, Railway e VPS rodam esse comando. No Windows, use `waitress-serve --port=8000 app:app` depois de `pip install waitress`.)
- O site precisa estar em **HTTPS**. Depois disso, coloque `COOKIE_SECURE=true` no `.env`.
- Configure o fuso do servidor para `America/Sao_Paulo` (variável `TZ`). As validades do código usam o relógio do banco, mas a regra "data já passou" usa o do servidor.
- O limite de tentativas de login fica na memória de cada processo. Com vários processos ou servidores, troque por Redis ou Flask-Limiter.

---

## API

Todas as rotas respondem JSON. Os erros vêm como `{ "mensagem": "...", "campo": "..." }`, e o site mostra a mensagem no campo certo. Os `POST` só aceitam `Content-Type: application/json`, o que protege contra CSRF junto com o cookie `SameSite=Lax`.

| Método | Rota | O que faz |
|---|---|---|
| POST | `/api/cadastro` | Valida os dados, guarda em `cadastro_pendente` (senha já em hash) e envia o código de 6 números. |
| POST | `/api/cadastro/confirmar` | `{ email, codigo }` → cria o cliente e já faz login. O código vale 10 min e aceita 5 tentativas. |
| POST | `/api/cadastro/reenviar` | `{ email }` → código novo, com espera de 60 s entre envios. |
| POST | `/api/login` | `{ email, senha }`. Mensagem genérica se errar; bloqueio após 10 erros em 15 min. |
| POST | `/api/logout` | Encerra a sessão. |
| GET | `/api/me` | Cliente logado (`id, nome, email, telefone`) ou 401. |
| GET | `/api/datas-ocupadas` | Reservas aguardando assinatura, confirmadas ou concluídas, de hoje em diante. |
| POST | `/api/reservas` | Exige login. Cria o pedido com status `pendente`. Responde 409 se a data já estiver ocupada. |

### Regras do pedido de reserva

- O pedido entra como **pendente**, com `valor_total` vazio, porque a equipe define o orçamento na visita.
- Pedidos pendentes **não bloqueiam** o calendário. A data só fica ocupada quando a equipe muda o status para `aguardando_assinatura` ou `confirmado`, e o trigger do banco impede duas reservas ocupando a mesma data.
- O campo "Observações" vira um registro em `observacoes`. Se o cliente informar um WhatsApp diferente do cadastro, ele também vai como observação para a equipe.

## O que ainda não existe

- **Painel da equipe:** aprovar pedidos, definir valor, registrar pagamentos e validar contratos. Por enquanto, isso é feito direto no banco, por exemplo:
  ```sql
  UPDATE aluguel SET status = 'aguardando_assinatura', valor_total = 3500.00 WHERE id = 1;
  ```
- **Recuperação de senha** ("esqueci minha senha").
- **Contrato:** geração do PDF preenchido, envio do arquivo assinado e conferência pelo hash (as tabelas já estão prontas).
