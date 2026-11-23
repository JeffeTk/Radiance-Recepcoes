<div align="center">

# Radiance Recepções e Eventos

**Site da casa de festas Radiance, em João Pessoa/PB, com calendário de disponibilidade, pedido de reserva on-line, área do cliente e área administrativa.**

![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-3-000000?logo=flask&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-8-4479A1?logo=mysql&logoColor=white)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)
![Codespaces](https://img.shields.io/badge/GitHub_Codespaces-pronto-181717?logo=github)

<img src="docs/screenshots/inicio.png" alt="Página inicial do site da Radiance" width="860">

</div>

---

## Sobre

A Radiance é uma casa de festas para casamentos, debutantes, aniversários e eventos corporativos. O site apresenta o espaço e permite que o cliente:

1. veja no calendário quais datas estão livres;
2. crie uma conta, com confirmação do e-mail por código;
3. envie o pedido de reserva, que entra no banco como **pendente** para a equipe confirmar pelo WhatsApp.

A equipe tem uma **área administrativa** para registrar as reservas fechadas fora do site (WhatsApp, redes sociais, telefone ou presencial) e acompanhar todas as reservas.

## Funcionalidades

**Site**

- Página inicial com o espaço, a estrutura, a galeria, o passo a passo da reserva, depoimentos, perguntas frequentes e contato.
- Página de reserva separada, com prévia do pedido em tempo real.
- Modo claro e escuro, com a escolha salva no navegador.
- Layout responsivo, do celular ao desktop.
- Botão flutuante do WhatsApp.

**Reserva**

- Calendário próprio que marca as datas já ocupadas.
- Eventos de **um dia** (turno diurno ou noturno) ou de **vários dias seguidos**.
- Nome e WhatsApp preenchidos com os dados da conta.
- Se a data for ocupada enquanto o cliente preenche, o site avisa e atualiza o calendário.

**Conta do cliente**

- Cadastro com validação de CPF, maioridade (18+), telefone e e-mail.
- **CEP com preenchimento automático** do endereço (via [ViaCEP](https://viacep.com.br)).
- **Confirmação do e-mail por código de 6 números**, que vale 10 minutos e aceita até 5 tentativas, com reenvio.
- Máscaras de CPF, telefone e CEP que deixam editar qualquer parte do número.
- Login com a sessão mantida entre as páginas.

**Área administrativa (`/admin`)**

- Acesso só para administradores, criados por um comando no terminal (sem conta padrão).
- Registro manual de reservas, com o canal de origem, o cliente (já cadastrado, ou novo com CEP automático), o evento, o status, o valor e o sinal pago.
- Aviso na hora se a data já estiver ocupada.
- Lista de todas as reservas, do site e manuais, com filtros.
- Clientes cadastrados pela equipe ficam sem conta. Se depois criarem conta no site com o mesmo CPF, o cadastro é completado e as reservas antigas aparecem para eles.

**Segurança no back-end**

- Senhas guardadas só como hash. O código de verificação é guardado como HMAC, nunca em texto.
- Cookie de sessão `HttpOnly` e `SameSite=Lax`, e a API só aceita JSON (proteção contra CSRF).
- Mensagem de login genérica e bloqueio depois de várias tentativas erradas.
- Toda validação do site é refeita no servidor.
- O banco impede, por trigger, duas reservas confirmadas na mesma data.

## Telas

| Pedido de reserva | Cadastro com CEP automático |
|---|---|
| <img src="docs/screenshots/reserva.png" alt="Página de reserva com calendário e prévia do pedido"> | <img src="docs/screenshots/cadastro.png" alt="Cadastro com endereço preenchido pelo CEP"> |
| **Confirmação do e-mail** | **Modo escuro** |
| <img src="docs/screenshots/verificacao.png" alt="Tela para digitar o código de 6 números"> | <img src="docs/screenshots/inicio-escuro.png" alt="Página inicial no modo escuro"> |

<p align="center"><img src="docs/screenshots/celular-escuro.png" alt="Site no celular, modo escuro" width="230"></p>

| Área administrativa: nova reserva | Área administrativa: reservas registradas |
|---|---|
| <img src="docs/screenshots/admin-nova-reserva.png" alt="Formulário para registrar uma reserva feita fora do site"> | <img src="docs/screenshots/admin-lista.png" alt="Lista de reservas com status, valores e origem"> |

## Tecnologias

| Parte | Tecnologia |
|---|---|
| Front-end | HTML5, CSS3 e JavaScript puro (sem frameworks) |
| Back-end | Python 3 + Flask, PyMySQL |
| Banco de dados | MySQL 8 (ou MariaDB 10.5+) |
| Serviços externos | ViaCEP (endereço pelo CEP) e SMTP (envio do código) |
| Ambiente | GitHub Codespaces / Dev Containers (Docker Compose) |

## Como rodar

### Opção 1: GitHub Codespaces (recomendado, sem instalar nada)

1. Clique em **Code → Codespaces → Create codespace on main**.
2. Espere alguns minutos na primeira vez. O ambiente cria o banco, instala as dependências e inicia o site sozinho.
3. Abra a aba **PORTAS**, passe o mouse em **Site Radiance (5000)** e clique no globo.

Os códigos de verificação de e-mail aparecem no terminal enquanto o SMTP não estiver configurado.

**Contas de teste** (criadas automaticamente no Codespace):

| Conta | E-mail | Senha |
|---|---|---|
| Área administrativa (`/admin`) | `adm@gmail.com` | `se12345678` |
| Cliente do site | `teste@gmail.com` | `te12345678` |

> Elas vêm de `banco/dados_teste.sql`, que serve só para desenvolvimento. No site no ar, crie o administrador com `python criar_admin.py` (veja o [Guia de instalação](docs/INSTALACAO.md#contas-de-teste)).

### Opção 2: no seu computador

Requisitos: **Python 3.10+** e **MySQL 8**.

```bash
# 1. Banco de dados (apaga e recria o banco "radiance")
mysql -u root -p < banco/radiance_banco.sql

# 2. Back-end
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # Windows: copy .env.example .env
#    → preencha SECRET_KEY e os dados do banco no .env

# 3. Contas de teste (adm@gmail.com / se12345678 e teste@gmail.com / te12345678)
mysql -u radiance -p radiance < ../banco/dados_teste.sql
#    ou crie o seu administrador: python criar_admin.py

# 4. Rodar
python app.py                      # site: http://localhost:5000  ·  admin: http://localhost:5000/admin
```

O passo a passo completo está no **[Guia de instalação](docs/INSTALACAO.md)**: usuário do banco, área administrativa, atualização de banco antigo, e-mail pelo Gmail, produção e problemas comuns.

### Opção 3: só ver o visual

Abra `site/index.html` direto no navegador. O site entra no **modo de teste**: nada é gravado, o código de e-mail aparece na tela e o calendário mostra datas de exemplo.

## Estrutura

```
├── .devcontainer/      configuração do Codespaces (Python + MySQL prontos)
├── site/               páginas (index.html, reserva.html, admin.html) e assets/ (CSS e JS)
├── backend/            servidor Flask: API em /api/* e as páginas do site
│   ├── app.py          ponto de entrada
│   ├── auth.py         cadastro, código por e-mail, login e sessão
│   ├── admin.py        área administrativa: login e reservas manuais
│   ├── criar_admin.py  cria o administrador pelo terminal
│   ├── reservas.py     calendário e pedidos de reserva
│   ├── validacao.py    regras de validação
│   └── email_envio.py  envio do código por SMTP
├── banco/
│   ├── radiance_banco.sql
│   ├── dados_teste.sql contas de teste (só desenvolvimento)
│   └── migracoes/      atualizações para bancos de versões anteriores
└── docs/               guia de instalação e prints das telas
```

## API

<details>
<summary>Ver rotas</summary>

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/api/cadastro` | Valida os dados e envia o código de 6 números por e-mail |
| `POST` | `/api/cadastro/confirmar` | Confere o código, cria a conta e faz login |
| `POST` | `/api/cadastro/reenviar` | Envia um código novo (espera de 60 s) |
| `POST` | `/api/login` | Entra na conta |
| `POST` | `/api/logout` | Sai da conta |
| `GET` | `/api/me` | Dados do cliente logado |
| `GET` | `/api/datas-ocupadas` | Datas reservadas, para o calendário |
| `POST` | `/api/reservas` | Cria o pedido de reserva (exige login) |
| `POST` | `/api/admin/login` · `/api/admin/logout` | Entra e sai da área administrativa |
| `GET` | `/api/admin/clientes?q=` | Busca clientes por nome, CPF ou telefone |
| `GET` | `/api/admin/reservas` | Lista as reservas (admin) |
| `POST` | `/api/admin/reservas` | Registra uma reserva feita fora do site (admin) |

Erros vêm como `{ "mensagem": "...", "campo": "..." }`. Detalhes no [Guia de instalação](docs/INSTALACAO.md#api).

</details>

## Banco de dados

| Tabela | Guarda |
|---|---|
| `administrador` | Quem acessa a área administrativa |
| `cliente` | Clientes: com conta no site (e-mail confirmado e senha) ou cadastrados pela equipe |
| `cadastro_pendente` | Cadastros aguardando o código de e-mail |
| `aluguel` | Pedidos e reservas: datas, turno, convidados, status, valor, origem e quem registrou |
| `pagamento` | Sinal e restante de cada reserva |
| `observacoes` | Observações do cliente e da equipe |
| `contrato` | Contrato gerado e assinado (gov.br), com hash dos arquivos |

A view `vw_datas_ocupadas` alimenta o calendário.

## Próximos passos

- [x] Área administrativa com registro manual de reservas
- [ ] Na área administrativa: mudar status, editar e cancelar reservas, registrar o pagamento do restante
- [ ] Geração do contrato em PDF e envio do arquivo assinado pelo gov.br
- [ ] Recuperação de senha
- [ ] Área do cliente com o histórico de reservas
