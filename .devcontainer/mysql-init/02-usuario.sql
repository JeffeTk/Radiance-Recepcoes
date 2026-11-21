-- Usuário que o site usa para acessar o banco no Codespace.
-- Só pode ler e gravar dados (não pode apagar tabelas).
-- Senha de desenvolvimento: o MySQL do Codespace não é acessível de fora.
CREATE USER IF NOT EXISTS 'radiance'@'%' IDENTIFIED BY 'radiance-dev';
GRANT SELECT, INSERT, UPDATE, DELETE ON radiance.* TO 'radiance'@'%';
FLUSH PRIVILEGES;
