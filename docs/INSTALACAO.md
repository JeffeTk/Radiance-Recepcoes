# Guia de instalação — Radiance Recepções e Eventos

← [Voltar ao README](../README.md)

```
radiance/
├── .devcontainer/        configuração do GitHub Codespaces (Python + MySQL prontos)
├── site/                 páginas (index.html, reserva.html, admin.html) e assets/ (CSS e JS)
├── backend/              servidor em Python + Flask (API em /api/* e as páginas do site)
│   ├── app.py            ponto de entrada
│   ├── auth.py           cadastro com código por e-mail, login, logout, sessão
│   ├── admin.py          área administrativa (/admin): login e reservas manuais
│   ├── criar_admin.py    comando que cria o administrador
│   ├── reservas.py       datas ocupadas e pedidos de reserva
│   ├── validacao.py      regras de validação (as mesmas do site)
│   ├── email_envio.py    envio do código por SMTP
│   ├── config.py, db.py
│   ├── requirements.txt
│   └── .env.example      modelo de configuração
└── banco/
    ├── radiance_banco.sql   cria o banco (tabelas, regras e trigger)
    ├── dados_teste.sql      contas de teste (só desenvolvimento)
    └── migracoes/           atualizações para bancos criados com versões anteriores
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
- **Entrar na área `/admin`:** use a conta de teste `adm@gmail.com` / `se12345678`, ou crie a sua em um terminal novo com `cd backend && python criar_admin.py`. Veja a seção [Área administrativa](#área-administrativa).
- **Mexer no banco** (por exemplo, aprovar uma reserva):
  ```bash
  mysql -h db -u radiance -pradiance-dev radiance
  ```
  ```sql
  UPDATE aluguel SET status = 'confirmado', valor_total = 3500.00 WHERE id = 1;
  ```
  Em Codespaces criados antes desta versão, se o comando `mysql` não existir, instale com `sudo apt-get update && sudo apt-get install -y default-mysql-client`.
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

## Área administrativa

Em **`/admin`** (por exemplo, `http://localhost:5000/admin`), a equipe registra reservas fechadas fora do site, como pelo WhatsApp, pelas redes sociais, por telefone ou presencialmente. Lá também dá para ver todas as reservas. O endereço não aparece em nenhum link do site, a página não entra no Google e todas as ações exigem login de administrador.

### Contas de teste

O arquivo `banco/dados_teste.sql` cria duas contas para testar:

| Conta | E-mail | Senha |
|---|---|---|
| Administrador (`/admin`) | `adm@gmail.com` | `se12345678` |
| Cliente do site | `teste@gmail.com` | `te12345678` |

- **Codespace novo:** as contas já são criadas sozinhas.
- **Codespace que já existia:** rode em um terminal novo (se ainda não rodou a migração da seção abaixo, rode ela antes):
  ```bash
  mysql -h db -u radiance -pradiance-dev radiance < banco/dados_teste.sql
  ```
- **No seu computador:** `mysql -u radiance -p radiance < banco/dados_teste.sql`.

Rodar de novo não duplica nada, só volta as senhas para as da tabela.

> ⚠ **Não use `dados_teste.sql` no site no ar.** As senhas estão escritas aqui, e qualquer pessoa que leia o repositório conseguiria entrar como administrador. Em produção, crie o administrador com `python criar_admin.py`. Se as contas de teste já estiverem no banco, apague com:
> ```sql
> DELETE FROM administrador WHERE email = 'adm@gmail.com';
> DELETE FROM cliente WHERE email = 'teste@gmail.com';
> ```

### Criar o administrador

Para ter o seu próprio administrador, e no site no ar, onde a conta de teste não deve existir: Crie a sua pelo terminal, dentro da pasta `backend`:

```bash
python criar_admin.py
```

O comando pede e-mail, nome e senha (mínimo de 10 caracteres, com letras e números). A senha não aparece enquanto você digita e é guardada só como hash. Para trocar a senha depois, rode o mesmo comando com o mesmo e-mail.

No Codespaces, abra um terminal novo (**+**) e rode `cd backend && python criar_admin.py`.

### O que dá para fazer

- **Registrar uma reserva** com:
  - o canal (presencial, WhatsApp, Instagram, Facebook, telefone ou outro);
  - o cliente;
  - a data, o turno ou os vários dias, e o número de convidados;
  - o status, o valor total e o sinal, se já foi pago;
  - observações.
- **Cliente já cadastrado:** busque por nome, CPF ou telefone.
- **Novo cliente:** preencha nome, CPF, nascimento, WhatsApp, e-mail (opcional) e endereço, com CEP automático. Ele fica **sem conta no site**, sem senha.
- **Status:**
  - *Pendente* não bloqueia o calendário, e o valor pode ficar em branco.
  - *Aguardando assinatura* e *Confirmado* bloqueiam a data no calendário do site e exigem o valor total.
- **Ver as reservas registradas:** tanto as do site quanto as manuais, com filtro por status e por cliente.

Se um cliente cadastrado pela equipe criar conta no site depois **com o mesmo CPF**, o cadastro dele é completado (sem duplicar), e as reservas feitas antes aparecem na conta.

### Atualizar um banco criado antes da área administrativa

Se o banco foi criado com uma versão anterior do `radiance_banco.sql` (por exemplo, um Codespace que já existia), rode a migração **uma vez**. Ela cria a tabela `administrador` e as colunas novas, e mantém os dados.

**No Codespaces** (terminal novo):
```bash
sudo apt-get update && sudo apt-get install -y default-mysql-client   # só se o comando mysql não existir
mysql -h db -u root -proot-dev-codespaces radiance < banco/migracoes/001_area_administrativa.sql
cd backend && python criar_admin.py
```
Depois reinicie o servidor: `Ctrl+C` no terminal dele e `bash .devcontainer/iniciar.sh`.

**No seu computador:**
```bash
mysql -u root -p radiance < banco/migracoes/001_area_administrativa.sql
cd backend && python criar_admin.py
```

> Quem cria o banco do zero com o `radiance_banco.sql` atual (ou um Codespace novo) **não** precisa da migração.

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
| POST | `/api/admin/login` | `{ email, senha }` do administrador. Mesmo bloqueio de tentativas do login do cliente. |
| POST | `/api/admin/logout` | Sai da área administrativa (não afeta o login de cliente no mesmo navegador). |
| GET | `/api/admin/me` | Administrador logado, ou 401. |
| GET | `/api/admin/clientes?q=` | Busca clientes por nome, CPF ou telefone (até 15). |
| GET | `/api/admin/reservas` | Reservas com cliente, valor, total pago, origem e quem registrou. |
| POST | `/api/admin/reservas` | Registra uma reserva feita fora do site: `cliente_id` (existente) **ou** `cliente` (novo), mais `origem`, dados do evento, `status`, `valor_total`, `sinal` e `observacao`. Responde 409 se a data estiver ocupada. |

Todas as rotas `/api/admin/*`, menos o login, respondem **401** para quem não é administrador, inclusive clientes logados.

### Regras do pedido de reserva

- O pedido entra como **pendente**, com `valor_total` vazio, porque a equipe define o orçamento na visita.
- Pedidos pendentes **não bloqueiam** o calendário. A data só fica ocupada quando a equipe muda o status para `aguardando_assinatura` ou `confirmado`, e o trigger do banco impede duas reservas ocupando a mesma data.
- O campo "Observações" vira um registro em `observacoes`. Se o cliente informar um WhatsApp diferente do cadastro, ele também vai como observação para a equipe.

## O que ainda não existe

- **Na área administrativa ainda falta:** mudar o status, editar ou cancelar uma reserva, registrar o pagamento do restante e validar contratos. Por enquanto, isso é feito direto no banco, por exemplo:
  ```sql
  UPDATE aluguel SET status = 'aguardando_assinatura', valor_total = 3500.00 WHERE id = 1;
  ```
- **Recuperação de senha** ("esqueci minha senha").
- **Contrato:** geração do PDF preenchido, envio do arquivo assinado e conferência pelo hash (as tabelas já estão prontas).
