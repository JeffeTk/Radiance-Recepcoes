-- =====================================================================
--  DADOS DE TESTE — só para desenvolvimento (Codespaces / seu computador)
--
--  Cria duas contas com senhas conhecidas:
--    Administrador (área /admin):  adm@gmail.com    senha: se12345678
--    Cliente do site:              teste@gmail.com  senha: te12345678
--
--  ⚠  NÃO rode este arquivo no banco do site no ar: qualquer pessoa que
--     leia o repositório saberia a senha do administrador. Em produção,
--     crie o administrador com:  python criar_admin.py
--
--  Pode rodar mais de uma vez: se as contas já existirem, as senhas
--  voltam a ser as de cima.
--    mysql -u radiance -p radiance < banco/dados_teste.sql
-- =====================================================================
SET NAMES utf8mb4;

-- Administrador (as senhas abaixo estão em hash, nunca em texto)
INSERT INTO administrador (nome, email, senha_hash, ativo)
VALUES ('Administrador', 'adm@gmail.com',
        'scrypt:32768:8:1$HOkOBBedAoBkATXI$8ea31bf6cd70481ad4857b7e6e731b64b949ec8dfa757446bbe8d564dfa1aac9d094f3af319e718b00fb380a82c587256da1712c66c231eaef79b4cfa5876755', TRUE)
ON DUPLICATE KEY UPDATE senha_hash = VALUES(senha_hash), ativo = TRUE;

-- Cliente de teste, com conta no site (e-mail já confirmado)
INSERT INTO cliente (nome, cpf, data_nascimento, endereco_cep, endereco_rua, endereco_numero,
                     endereco_bairro, endereco_cidade, endereco_uf, telefone, email,
                     email_verificado_em, senha_hash)
VALUES ('Cliente Teste', '52998224725', '1995-01-15', '58064010', 'Rua Aldary Lucena Paiva', '100',
        'Valentina de Figueiredo', 'João Pessoa', 'PB', '83999990000', 'teste@gmail.com',
        NOW(), 'scrypt:32768:8:1$bwth1dHgJryit20t$4c37e86b12549d150bb9090b19572f5aa77094f448913e036b5ce6d201519702a276d9e0ea1f3a4841c3268ab19268345248aea2a5e1759ea58abec1548ee364')
ON DUPLICATE KEY UPDATE senha_hash = VALUES(senha_hash), email = VALUES(email),
                        email_verificado_em = COALESCE(email_verificado_em, NOW());
