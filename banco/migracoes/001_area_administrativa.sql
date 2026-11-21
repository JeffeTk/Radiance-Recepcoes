-- =====================================================================
--  Migração 001 — área administrativa
--  Para bancos criados ANTES desta versão (ex.: um Codespace que já
--  estava rodando). Quem cria o banco do zero com radiance_banco.sql
--  NÃO precisa rodar isto.
--  Rode uma única vez, com um usuário que pode alterar tabelas (root):
--    mysql -u root -p radiance < banco/migracoes/001_area_administrativa.sql
-- =====================================================================
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS administrador (
  id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  nome          VARCHAR(120)  NOT NULL,
  email         VARCHAR(150)  NOT NULL,
  senha_hash    VARCHAR(255)  NOT NULL,
  ativo         BOOLEAN       NOT NULL DEFAULT TRUE,
  data_criacao  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_administrador PRIMARY KEY (id),
  CONSTRAINT uq_administrador_email UNIQUE (email)
);

-- clientes cadastrados pela equipe podem não ter conta (senha) nem e-mail
ALTER TABLE cliente
  MODIFY email               VARCHAR(150) NULL,
  MODIFY email_verificado_em DATETIME     NULL,
  MODIFY senha_hash          VARCHAR(255) NULL,
  ADD CONSTRAINT ck_cliente_conta CHECK (
    senha_hash IS NULL OR (email IS NOT NULL AND email_verificado_em IS NOT NULL)
  );

-- de onde veio a reserva e quem a registrou
ALTER TABLE aluguel
  ADD COLUMN origem ENUM('site', 'presencial', 'whatsapp', 'instagram',
                         'facebook', 'telefone', 'outro') NOT NULL DEFAULT 'site' AFTER valor_total,
  ADD COLUMN registrado_por INT UNSIGNED NULL AFTER origem,
  ADD CONSTRAINT fk_aluguel_administrador FOREIGN KEY (registrado_por)
    REFERENCES administrador (id) ON UPDATE RESTRICT ON DELETE RESTRICT;
