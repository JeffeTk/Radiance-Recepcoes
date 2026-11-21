-- =====================================================================
--  RADIANCE RECEPÇÕES E EVENTOS — Banco de dados
--  SGBD: MySQL 8.0.16+ (também roda no MariaDB 10.5+)
--  Charset: utf8mb4 (acentos e emojis nas observações)
-- =====================================================================

-- Chaves estrangeiras usam ON UPDATE RESTRICT: os ids são AUTO_INCREMENT
-- e nunca mudam, e o MySQL não aceita CASCADE em colunas que aparecem
-- em CHECK ou em coluna gerada.

-- Garante que os acentos do script ("Aniversário", mensagens dos
-- triggers) sejam lidos como UTF-8, qualquer que seja o cliente usado.
SET NAMES utf8mb4;

DROP DATABASE IF EXISTS radiance;
CREATE DATABASE radiance
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE radiance;


-- ---------------------------------------------------------------------
-- ADMINISTRADOR
-- Quem acessa a área administrativa (/admin). Criado pelo comando
-- "python criar_admin.py" no back-end — não existe conta padrão.
-- ---------------------------------------------------------------------
CREATE TABLE administrador (
  id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  nome          VARCHAR(120)  NOT NULL,
  email         VARCHAR(150)  NOT NULL,
  senha_hash    VARCHAR(255)  NOT NULL,
  ativo         BOOLEAN       NOT NULL DEFAULT TRUE,
  data_criacao  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT pk_administrador PRIMARY KEY (id),
  CONSTRAINT uq_administrador_email UNIQUE (email)
);


-- ---------------------------------------------------------------------
-- CLIENTE
-- Preenchido pelo cadastro do site. CPF e telefone são guardados só
-- com dígitos (o back-end remove a máscara antes de inserir).
-- A senha NUNCA é guardada: só o hash (bcrypt / argon2).
-- A regra "18 anos ou mais" fica no back-end, porque CHECK no MySQL
-- não aceita CURRENT_DATE.
-- Dois tipos de cliente:
--  • com conta no site: tem e-mail confirmado (código de 6 números, ver
--    cadastro_pendente) e senha — pode fazer login;
--  • cadastrado pela equipe na área administrativa (reserva feita por
--    redes sociais ou presencialmente): sem senha, e-mail opcional.
--    Se depois a pessoa criar conta no site com o mesmo CPF, o cadastro
--    é completado e as reservas antigas passam a aparecer para ela.
-- ---------------------------------------------------------------------
CREATE TABLE cliente (
  id               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  nome             VARCHAR(120)  NOT NULL,
  cpf              CHAR(11)      NOT NULL,
  data_nascimento  DATE          NOT NULL,
  endereco_cep     CHAR(8)       NOT NULL,   -- só dígitos
  endereco_rua     VARCHAR(150)  NOT NULL,
  endereco_numero  VARCHAR(10)   NOT NULL,   -- texto: aceita "S/N", "12A"
  endereco_bairro  VARCHAR(80)   NOT NULL,
  endereco_cidade  VARCHAR(80)   NOT NULL,
  endereco_uf      CHAR(2)       NOT NULL,
  telefone         VARCHAR(11)   NOT NULL,
  email            VARCHAR(150)  NULL,       -- opcional para quem não tem conta
  email_verificado_em DATETIME   NULL,
  senha_hash       VARCHAR(255)  NULL,       -- NULL = sem conta no site
  data_criacao     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT pk_cliente PRIMARY KEY (id),
  CONSTRAINT uq_cliente_cpf   UNIQUE (cpf),
  CONSTRAINT uq_cliente_email UNIQUE (email),
  CONSTRAINT ck_cliente_cpf      CHECK (cpf REGEXP '^[0-9]{11}$'),
  CONSTRAINT ck_cliente_telefone CHECK (telefone REGEXP '^[0-9]{10,11}$'),
  CONSTRAINT ck_cliente_cep CHECK (endereco_cep REGEXP '^[0-9]{8}$'),
  -- quem tem senha (conta no site) precisa ter e-mail confirmado
  CONSTRAINT ck_cliente_conta CHECK (
    senha_hash IS NULL OR (email IS NOT NULL AND email_verificado_em IS NOT NULL)
  ),
  CONSTRAINT ck_cliente_uf CHECK (endereco_uf IN (
    'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA',
    'PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'))
);


-- ---------------------------------------------------------------------
-- CADASTRO_PENDENTE
-- 1ª etapa do cadastro: o site envia os dados, o back-end guarda aqui e
-- manda um código de 6 números para o e-mail. Quando o código é
-- confirmado, os dados vão para "cliente" e a linha daqui é apagada.
--   dados       → JSON com os campos do cadastro, com a senha JÁ em hash
--                 (a senha pura nunca é gravada)
--   codigo_hash → hash do código (o código em si não fica no banco)
--   expira_em   → 10 minutos após o envio
--   tentativas  → no máximo 5; depois disso só reenviando um código novo
-- Linhas expiradas podem ser apagadas por uma rotina do back-end.
-- ---------------------------------------------------------------------
CREATE TABLE cadastro_pendente (
  id            INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  email         VARCHAR(150)      NOT NULL,
  dados         JSON              NOT NULL,
  codigo_hash   VARCHAR(255)      NOT NULL,
  expira_em     DATETIME          NOT NULL,
  tentativas    TINYINT UNSIGNED  NOT NULL DEFAULT 0,
  data_envio    DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT pk_cadastro_pendente PRIMARY KEY (id),
  CONSTRAINT uq_cadastro_pendente_email UNIQUE (email),
  CONSTRAINT ck_cadastro_pendente_tentativas CHECK (tentativas <= 5),
  CONSTRAINT ck_cadastro_pendente_expira CHECK (expira_em > data_envio)
);


-- ---------------------------------------------------------------------
-- ALUGUEL
-- Status:
--   pendente              → pedido enviado pelo site, aguardando a equipe
--   aguardando_assinatura → equipe aprovou e definiu o valor; contrato gerado
--   confirmado            → contrato assinado e validado
--   cancelado / concluido
-- Só "aguardando_assinatura", "confirmado" e "concluido" ocupam a data
-- (pedido pendente não bloqueia o calendário).
-- ---------------------------------------------------------------------
CREATE TABLE aluguel (
  id                  INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  id_cliente          INT UNSIGNED      NOT NULL,
  data_solicitacao    DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data_inicio_evento  DATE              NOT NULL,
  data_final_evento   DATE              NOT NULL,
  tipo_evento         ENUM('Casamento', 'Debutante (15 anos)', 'Aniversário',
                           'Corporativo', 'Outro') NOT NULL,
  num_convidados      SMALLINT UNSIGNED NOT NULL,
  turno               ENUM('Diurno', 'Noturno') NULL,
  status              ENUM('pendente', 'aguardando_assinatura', 'confirmado',
                           'cancelado', 'concluido') NOT NULL DEFAULT 'pendente',
  valor_total         DECIMAL(10,2)     NULL,   -- definido pelo back-end/equipe
  origem              ENUM('site', 'presencial', 'whatsapp', 'instagram',
                           'facebook', 'telefone', 'outro') NOT NULL DEFAULT 'site',
  registrado_por      INT UNSIGNED      NULL,   -- administrador que lançou (NULL = pelo site)

  CONSTRAINT pk_aluguel PRIMARY KEY (id),
  CONSTRAINT fk_aluguel_cliente FOREIGN KEY (id_cliente)
    REFERENCES cliente (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_aluguel_administrador FOREIGN KEY (registrado_por)
    REFERENCES administrador (id) ON UPDATE RESTRICT ON DELETE RESTRICT,

  CONSTRAINT ck_aluguel_datas      CHECK (data_final_evento >= data_inicio_evento),
  CONSTRAINT ck_aluguel_convidados CHECK (num_convidados BETWEEN 1 AND 100),
  CONSTRAINT ck_aluguel_valor      CHECK (valor_total IS NULL OR valor_total > 0),
  -- 1 dia → turno obrigatório; mais de 1 dia → ocupa diurno e noturno, turno NULL
  CONSTRAINT ck_aluguel_turno CHECK (
       (data_final_evento =  data_inicio_evento AND turno IS NOT NULL)
    OR (data_final_evento >  data_inicio_evento AND turno IS NULL)
  ),
  -- só sai de "pendente" com valor definido
  CONSTRAINT ck_aluguel_valor_status CHECK (
    status IN ('pendente', 'cancelado') OR valor_total IS NOT NULL
  )
);

CREATE INDEX ix_aluguel_cliente ON aluguel (id_cliente);
CREATE INDEX ix_aluguel_agenda  ON aluguel (status, data_inicio_evento, data_final_evento);


-- ---------------------------------------------------------------------
-- PAGAMENTO
-- tipo: sinal (30%) ou restante.
-- ---------------------------------------------------------------------
CREATE TABLE pagamento (
  id               INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  id_aluguel       INT UNSIGNED   NOT NULL,
  tipo             ENUM('sinal', 'restante') NOT NULL,
  valor            DECIMAL(10,2)  NOT NULL,
  forma_pagamento  ENUM('pix', 'cartao_credito', 'cartao_debito',
                        'boleto', 'dinheiro') NOT NULL,
  status           ENUM('pendente', 'pago', 'estornado') NOT NULL DEFAULT 'pendente',
  data_pagamento   DATETIME       NULL,   -- preenchida quando status = pago

  CONSTRAINT pk_pagamento PRIMARY KEY (id),
  CONSTRAINT fk_pagamento_aluguel FOREIGN KEY (id_aluguel)
    REFERENCES aluguel (id) ON UPDATE RESTRICT ON DELETE RESTRICT,

  CONSTRAINT ck_pagamento_valor CHECK (valor > 0),
  CONSTRAINT ck_pagamento_data  CHECK (status = 'pendente' OR data_pagamento IS NOT NULL)
);

CREATE INDEX ix_pagamento_aluguel ON pagamento (id_aluguel);


-- ---------------------------------------------------------------------
-- OBSERVACOES
-- O campo "Observações" do formulário vira o primeiro registro
-- (autor = 'cliente'). A equipe pode adicionar outras depois.
-- O cliente vem por id_aluguel → aluguel.id_cliente (sem redundância).
-- ---------------------------------------------------------------------
CREATE TABLE observacoes (
  id                INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  id_aluguel        INT UNSIGNED  NOT NULL,
  autor             ENUM('cliente', 'equipe') NOT NULL,
  texto_observacao  TEXT          NOT NULL,
  data_criacao      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT pk_observacoes PRIMARY KEY (id),
  CONSTRAINT fk_observacoes_aluguel FOREIGN KEY (id_aluguel)
    REFERENCES aluguel (id) ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE INDEX ix_observacoes_aluguel ON observacoes (id_aluguel);


-- ---------------------------------------------------------------------
-- CONTRATO
-- Os arquivos ficam numa pasta/serviço de armazenamento; aqui vão só o
-- caminho e o hash SHA-256 (64 caracteres hex) de cada um.
--   caminho_original     → PDF gerado pelo site
--   caminho_assinado     → PDF assinado no gov.br, enviado pelo cliente
--   caminho_relatorio    → relatório do validar.iti.gov.br no dia da validação
-- Um aluguel pode ter várias tentativas (ex.: cliente enviou arquivo
-- errado → recusado → novo envio), mas só UM contrato aprovado.
-- ---------------------------------------------------------------------
CREATE TABLE contrato (
  id                   INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  id_aluguel           INT UNSIGNED  NOT NULL,
  versao_modelo        VARCHAR(20)   NOT NULL,          -- ex.: 'v1.0'
  caminho_original     VARCHAR(255)  NOT NULL,
  hash_original        CHAR(64)      NOT NULL,
  caminho_assinado     VARCHAR(255)  NULL,
  hash_assinado        CHAR(64)      NULL,
  caminho_relatorio    VARCHAR(255)  NULL,
  data_geracao         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data_envio_assinado  DATETIME      NULL,
  status               ENUM('aguardando_assinatura', 'em_analise',
                            'aprovado', 'recusado')
                                     NOT NULL DEFAULT 'aguardando_assinatura',
  data_validacao       DATETIME      NULL,
  motivo_recusa        VARCHAR(255)  NULL,

  -- coluna auxiliar: só tem valor quando aprovado → UNIQUE garante
  -- no máximo um contrato aprovado por aluguel
  aprovado_unico       INT UNSIGNED
    AS (CASE WHEN status = 'aprovado' THEN id_aluguel END) STORED,

  CONSTRAINT pk_contrato PRIMARY KEY (id),
  CONSTRAINT uq_contrato_aprovado UNIQUE (aprovado_unico),
  CONSTRAINT fk_contrato_aluguel FOREIGN KEY (id_aluguel)
    REFERENCES aluguel (id) ON UPDATE RESTRICT ON DELETE RESTRICT,

  CONSTRAINT ck_contrato_hash_original CHECK (hash_original REGEXP '^[0-9a-f]{64}$'),
  CONSTRAINT ck_contrato_hash_assinado CHECK (hash_assinado IS NULL OR hash_assinado REGEXP '^[0-9a-f]{64}$'),
  -- a partir de "em_analise" o arquivo assinado tem que existir
  CONSTRAINT ck_contrato_assinado CHECK (
    status = 'aguardando_assinatura'
    OR (caminho_assinado IS NOT NULL AND hash_assinado IS NOT NULL
        AND data_envio_assinado IS NOT NULL)
  ),
  -- aprovado/recusado exige a data da validação
  CONSTRAINT ck_contrato_validacao CHECK (
    status IN ('aguardando_assinatura', 'em_analise')
    OR data_validacao IS NOT NULL
  ),
  -- aprovado exige o relatório do validador do ITI
  CONSTRAINT ck_contrato_relatorio CHECK (status <> 'aprovado' OR caminho_relatorio IS NOT NULL),
  -- recusado exige o motivo
  CONSTRAINT ck_contrato_recusa CHECK (status <> 'recusado' OR motivo_recusa IS NOT NULL)
);

CREATE INDEX ix_contrato_aluguel ON contrato (id_aluguel);


-- ---------------------------------------------------------------------
-- REGRA "UMA RESERVA POR DATA"
-- Impede que duas reservas que ocupam a data se sobreponham.
-- (MySQL não tem constraint de exclusão, por isso o trigger.)
-- ---------------------------------------------------------------------
DELIMITER $$

CREATE TRIGGER trg_aluguel_conflito_ins
BEFORE INSERT ON aluguel
FOR EACH ROW
BEGIN
  IF NEW.status IN ('aguardando_assinatura', 'confirmado', 'concluido')
     AND EXISTS (
       SELECT 1 FROM aluguel a
        WHERE a.status IN ('aguardando_assinatura', 'confirmado', 'concluido')
          AND a.data_inicio_evento <= NEW.data_final_evento
          AND a.data_final_evento  >= NEW.data_inicio_evento
     ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Já existe uma reserva ocupando essa(s) data(s).';
  END IF;
END$$

CREATE TRIGGER trg_aluguel_conflito_upd
BEFORE UPDATE ON aluguel
FOR EACH ROW
BEGIN
  IF NEW.status IN ('aguardando_assinatura', 'confirmado', 'concluido')
     AND EXISTS (
       SELECT 1 FROM aluguel a
        WHERE a.id <> NEW.id
          AND a.status IN ('aguardando_assinatura', 'confirmado', 'concluido')
          AND a.data_inicio_evento <= NEW.data_final_evento
          AND a.data_final_evento  >= NEW.data_inicio_evento
     ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Já existe uma reserva ocupando essa(s) data(s).';
  END IF;
END$$

DELIMITER ;


-- ---------------------------------------------------------------------
-- VIEW para o GET /api/datas-ocupadas do calendário do site
-- (mesmo formato que o front espera: data_inicio_evento / data_final_evento)
-- ---------------------------------------------------------------------
CREATE VIEW vw_datas_ocupadas AS
SELECT data_inicio_evento, data_final_evento
  FROM aluguel
 WHERE status IN ('aguardando_assinatura', 'confirmado', 'concluido')
   AND data_final_evento >= CURRENT_DATE;
