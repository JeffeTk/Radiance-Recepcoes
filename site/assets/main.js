// =====================================================================
// RADIANCE — script compartilhado (index.html e reserva.html)
// =====================================================================

// ---------- modo escuro ----------
// A escolha fica salva no navegador, para valer nas duas páginas.
const themeToggle = document.getElementById('themeToggle');
function applyTheme(isDark) {
  document.body.classList.toggle('dark-mode', isDark);
  themeToggle.setAttribute('aria-pressed', String(isDark));
  themeToggle.setAttribute('aria-label', isDark ? 'Desativar modo escuro' : 'Ativar modo escuro');
}
applyTheme(document.body.classList.contains('dark-mode'));
themeToggle.addEventListener('click', () => {
  const isDark = !document.body.classList.contains('dark-mode');
  applyTheme(isDark);
  try { localStorage.setItem('radianceTheme', isDark ? 'dark' : 'light'); } catch (e) {}
});

// ---------- menu mobile ----------
const burger = document.getElementById('burgerBtn');
const navLinks = document.getElementById('navLinks');
burger.addEventListener('click', () => navLinks.classList.toggle('open'));
navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', () => navLinks.classList.remove('open')));

// ---------- reveal on scroll ----------
const revealEls = document.querySelectorAll('.reveal');
const io = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      io.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });
revealEls.forEach(el => io.observe(el));

// ---------- FAQ accordion ----------
document.querySelectorAll('.faq-item').forEach(item => {
  const btn = item.querySelector('.faq-q');
  const ans = item.querySelector('.faq-a');
  btn.addEventListener('click', () => {
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item.open').forEach(other => {
      other.classList.remove('open');
      other.querySelector('.faq-a').style.maxHeight = null;
    });
    if (!isOpen) {
      item.classList.add('open');
      ans.style.maxHeight = ans.scrollHeight + 'px';
    }
  });
});

// ---------- utilitários (telefone e datas) ----------

// Aplica uma máscara (telefone, CPF, CEP…) sem atrapalhar a edição:
//  • o cursor fica no mesmo lugar — dá para corrigir um número do início
//    ou do meio sem apagar tudo;
//  • Backspace/Delete pulam os separadores "(", ")", " ", "-", "." e
//    apagam o número ao lado;
//  • com o campo cheio, um número a mais não empurra os outros para fora.
// O cursor é guardado como "quantos números ficam antes dele", porque a
// posição em caracteres muda quando a máscara põe ou tira separadores.
function bindMask(input, mask, maxDigits, onChange) {
  const digitos = v => v.replace(/\D/g, '');
  const numerosAntes = (v, pos) => digitos(v.slice(0, pos)).length;
  let anterior = input.value;

  function posicionar(qtd) {
    const v = input.value;
    let p = 0, c = 0;
    if (qtd === 0) {
      while (p < v.length && /\D/.test(v[p])) p++;         // depois do "(" inicial
    } else {
      while (p < v.length && c < qtd) { if (/\d/.test(v[p])) c++; p++; }
    }
    if (document.activeElement === input) input.setSelectionRange(p, p);
  }

  function aplicar(bruto, qtdAntes) {
    input.value = mask(bruto);
    anterior = input.value;
    posicionar(qtdAntes);
    if (onChange) onChange();
  }

  // mudança feita pelo código não dispara 'input' sozinha: avisa a prévia
  // da reserva, a busca do CEP etc.
  const avisarMudanca = () => input.dispatchEvent(new Event('input', { bubbles: true }));

  input.addEventListener('keydown', e => {
    if (e.key !== 'Backspace' && e.key !== 'Delete') return;
    const v = input.value;
    const ini = input.selectionStart, fim = input.selectionEnd;
    if (ini !== fim) return;                               // com seleção, o navegador resolve
    if (e.key === 'Backspace') {
      let i = ini;
      while (i > 0 && /\D/.test(v[i - 1])) i--;            // pula separadores à esquerda
      if (i === ini) return;                               // já é um número: comportamento normal
      e.preventDefault();
      if (i === 0) return;
      aplicar(v.slice(0, i - 1) + v.slice(i), numerosAntes(v, i - 1));
      avisarMudanca();
    } else {
      let i = ini;
      while (i < v.length && /\D/.test(v[i])) i++;         // pula separadores à direita
      if (i === ini) return;
      e.preventDefault();
      if (i >= v.length) return;
      aplicar(v.slice(0, i) + v.slice(i + 1), numerosAntes(v, ini));
      avisarMudanca();
    }
  });

  input.addEventListener('input', () => {
    const v = input.value;
    if (digitos(v).length > maxDigits) {                   // campo cheio: ignora o número extra
      const pos = Math.max(0, input.selectionStart - 1);
      input.value = anterior;
      posicionar(numerosAntes(anterior, Math.min(pos, anterior.length)));
      return;
    }
    aplicar(v, numerosAntes(v, input.selectionStart));
  });
}

function maskPhone(raw) {
  let digits = raw.replace(/\D/g, '').slice(0, 11);
  if (digits.length > 10) {
    return digits.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, '($1) $2-$3');
  } else if (digits.length > 5) {
    return digits.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, '($1) $2-$3');
  } else if (digits.length > 2) {
    return digits.replace(/^(\d{2})(\d{0,5}).*/, '($1) $2');
  } else if (digits.length > 0) {
    return digits.replace(/^(\d{0,2}).*/, '($1');
  }
  return '';
}

function isValidPhone(value) {
  const digits = value.replace(/\D/g, '');
  // DDD (2 dígitos) + número com 8 ou 9 dígitos = 10 ou 11 dígitos no total
  if (digits.length !== 10 && digits.length !== 11) return false;
  const ddd = parseInt(digits.slice(0, 2), 10);
  if (ddd < 11 || ddd > 99) return false;
  if (digits.length === 11 && digits[2] !== '9') return false; // celular começa com 9
  return true;
}

const pad = n => String(n).padStart(2, '0');
const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromISO = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };

// =====================================================================
// LOGIN E CADASTRO
// =====================================================================
// O modo de teste liga sozinho quando a página é aberta direto do arquivo
// (file://): as rotas são simuladas e as contas ficam só na sessão da aba.
// Aberto pelo servidor Flask (pasta backend/), o site usa a API de verdade:
//   POST /api/cadastro            { nome, cpf, data_nascimento, telefone, email, senha,
//                                   endereco: { cep, rua, numero, bairro, cidade, uf } }
//                                   → valida, guarda como pendente e envia o código
//                                     de 6 números para o e-mail. Resposta: { email }
//   POST /api/cadastro/confirmar  { email, codigo } → cria a conta e já faz login
//   POST /api/cadastro/reenviar   { email }         → gera e envia um código novo
//   POST /api/login     { email, senha }
//   POST /api/logout
//   GET  /api/me        → cliente logado (para manter a sessão ao recarregar)
// Respostas de sucesso: { id, nome, email, telefone }.
// Respostas de erro:    { mensagem, campo? }  (campo = 'email', 'cpf'...)
// IMPORTANTE: o back-end deve guardar só o hash da senha (bcrypt/argon2)
// e manter a sessão em cookie HttpOnly — nunca devolver a senha.
// Código de verificação: gerado no servidor, guardado só como hash, vale
// 10 minutos e aceita no máximo 5 tentativas (depois, só reenviando).
const USE_FAKE_API = location.protocol === 'file:';

let currentUser = null;
let pendingReserva = false;

// Avisa as outras partes do site (ex.: reserva.js) que o login mudou.
//   detail.user      → cliente logado ou null
//   detail.continuar → true se o login foi pedido no meio de uma reserva
function notifyAuth(continuar) {
  document.dispatchEvent(new CustomEvent('radiance:auth', { detail: { user: currentUser, continuar } }));
}

// Usado pela reserva: abre o login e, quando ele terminar, o pedido segue.
function requireLogin(reason) {
  pendingReserva = true;
  openAuth('login', reason);
}

// ---------- camada de API ----------
async function apiRequest(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.mensagem || 'Não foi possível concluir agora. Tente novamente.');
    err.campo = data.campo;
    throw err;
  }
  return data;
}

// SIMULAÇÃO: as contas de teste ficam na sessão do navegador (somem ao
// fechar a aba) para funcionarem nas duas páginas. Só existe no modo
// USE_FAKE_API — no back-end real a senha nunca sai do servidor.
function loadFakeUsers() { try { return JSON.parse(sessionStorage.getItem('radianceFakeUsers')) || []; } catch { return []; } }
function saveFakeUsers() { try { sessionStorage.setItem('radianceFakeUsers', JSON.stringify(fakeUsers)); } catch {} }
const fakeUsers = USE_FAKE_API ? loadFakeUsers() : [];
const wait = ms => new Promise(r => setTimeout(r, ms));
function apiError(mensagem, campo) { const e = new Error(mensagem); e.campo = campo; return e; }
// cadastros aguardando a confirmação do e-mail (simulação)
const fakePending = {};
function novoCodigoFake() {
  return { codigo: String(Math.floor(Math.random() * 1e6)).padStart(6, '0'), expira: Date.now() + 10 * 60 * 1000, tentativas: 0 };
}
const publicUser = u => ({ id: u.id, nome: u.nome, email: u.email, telefone: u.telefone });

const authApi = {
  // 1ª etapa: envia os dados e dispara o código para o e-mail
  async cadastro(dados) {
    if (!USE_FAKE_API) return apiRequest('POST', '/api/cadastro', dados);
    await wait(500);
    if (fakeUsers.some(u => u.email === dados.email)) throw apiError('Já existe uma conta com este e-mail.', 'email');
    if (fakeUsers.some(u => u.cpf === dados.cpf)) throw apiError('Já existe uma conta com este CPF.', 'cpf');
    fakePending[dados.email] = { dados, ...novoCodigoFake() };
    return { email: dados.email, codigo_teste: fakePending[dados.email].codigo };
  },
  // 2ª etapa: confere o código e cria a conta
  async confirmarCadastro(email, codigo) {
    if (!USE_FAKE_API) return apiRequest('POST', '/api/cadastro/confirmar', { email, codigo });
    await wait(500);
    const p = fakePending[email];
    if (!p) throw apiError('Cadastro não encontrado. Preencha os dados de novo.');
    if (Date.now() > p.expira) throw apiError('O código expirou. Clique em "Reenviar código".', 'codigo');
    if (p.tentativas >= 5) throw apiError('Muitas tentativas. Clique em "Reenviar código".', 'codigo');
    if (p.codigo !== codigo) { p.tentativas++; throw apiError('Código incorreto. Confira e tente de novo.', 'codigo'); }
    const user = { id: fakeUsers.length + 1, ...p.dados, email_verificado: true };
    fakeUsers.push(user);
    saveFakeUsers();
    delete fakePending[email];
    return publicUser(user);
  },
  async reenviarCodigo(email) {
    if (!USE_FAKE_API) return apiRequest('POST', '/api/cadastro/reenviar', { email });
    await wait(400);
    const p = fakePending[email];
    if (!p) throw apiError('Cadastro não encontrado. Preencha os dados de novo.');
    Object.assign(p, novoCodigoFake());
    return { email, codigo_teste: p.codigo };
  },
  async login(email, senha) {
    if (!USE_FAKE_API) return apiRequest('POST', '/api/login', { email, senha });
    await wait(500);
    const user = fakeUsers.find(u => u.email === email && u.senha === senha);
    // mensagem genérica de propósito: não revela se o e-mail existe
    if (!user) throw apiError('E-mail ou senha incorretos.');
    return publicUser(user);
  },
  async logout() {
    if (!USE_FAKE_API) return apiRequest('POST', '/api/logout');
  },
  async me() {
    if (!USE_FAKE_API) {
      try { return await apiRequest('GET', '/api/me'); } catch { return null; }
    }
    try { return JSON.parse(sessionStorage.getItem('radianceUser')); } catch { return null; }
  },
};

// ---------- elementos ----------
const authOverlay = document.getElementById('authOverlay');
const authTitle = document.getElementById('authTitle');
const authReason = document.getElementById('authReason');
const authAlert = document.getElementById('authAlert');
const loginForm = document.getElementById('loginForm');
const cadastroForm = document.getElementById('cadastroForm');
const verifyForm = document.getElementById('verifyForm');
const authTabs = document.getElementById('authTabs');
const accountBtn = document.getElementById('accountBtn');
const accountLabel = document.getElementById('accountLabel');
const accountMenu = document.getElementById('accountMenu');
const accountEmail = document.getElementById('accountEmail');
let lastFocus = null;

// ---------- abrir / fechar modal ----------
function switchTab(tab) {
  const isLogin = tab === 'login';
  loginForm.hidden = !isLogin;
  cadastroForm.hidden = isLogin;
  verifyForm.hidden = true;
  authTabs.hidden = false;
  authTitle.textContent = isLogin ? 'Entrar na sua conta' : 'Criar sua conta';
  document.querySelectorAll('.auth-tab').forEach(b => {
    const active = b.dataset.tab === tab;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', String(active));
  });
  hideAlert();
  const first = (isLogin ? loginForm : cadastroForm).querySelector('input');
  if (authOverlay.classList.contains('open')) setTimeout(() => first.focus(), 50);
}

function openAuth(tab = 'login', reason = '') {
  lastFocus = document.activeElement;
  authReason.textContent = reason;
  authOverlay.classList.add('open');
  authOverlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('auth-lock');
  switchTab(tab);
}

function closeAuth() {
  authOverlay.classList.remove('open');
  authOverlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('auth-lock');
  pendingReserva = false;
  if (lastFocus) lastFocus.focus();
}

document.getElementById('authClose').addEventListener('click', closeAuth);
authOverlay.addEventListener('mousedown', e => { if (e.target === authOverlay) closeAuth(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && authOverlay.classList.contains('open')) closeAuth();
});
document.querySelectorAll('.auth-tab').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
document.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.goto)));

// mostrar / esconder senha
document.querySelectorAll('.pw-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = btn.previousElementSibling;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.textContent = show ? 'Ocultar' : 'Ver';
    btn.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
  });
});

// ---------- mensagens ----------
function showAlert(msg, ok = false) {
  authAlert.textContent = msg;
  authAlert.classList.toggle('ok', ok);
  authAlert.classList.add('show');
}
function hideAlert() { authAlert.classList.remove('show', 'ok'); }

function setError(input, msg) {
  const err = input.closest('.field').querySelector('.field-error');
  input.classList.toggle('invalid', !!msg);
  input.classList.toggle('valid', !msg && input.value !== '');
  err.textContent = msg || '';
  err.classList.toggle('show', !!msg);
  return !msg;
}

// ---------- validações ----------
const isEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

function maskCPF(v) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  return d.replace(/(\d{3})(\d)/, '$1.$2')
          .replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
          .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
}

function isValidCPF(v) {
  const c = v.replace(/\D/g, '');
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  for (let t = 9; t < 11; t++) {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += Number(c[i]) * (t + 1 - i);
    const dig = ((soma * 10) % 11) % 10;
    if (dig !== Number(c[t])) return false;
  }
  return true;
}

function idade(iso) {
  const n = fromISO(iso), h = new Date();
  let anos = h.getFullYear() - n.getFullYear();
  if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) anos--;
  return anos;
}

const senhaForte = v => v.length >= 8 && /[A-Za-z]/.test(v) && /\d/.test(v);

const f = id => document.getElementById(id);
const cad = {
  nome: f('cadNome'), cpf: f('cadCpf'), nascimento: f('cadNascimento'), telefone: f('cadTelefone'),
  email: f('cadEmail'), cep: f('cadCep'), rua: f('cadRua'), numero: f('cadNumero'), bairro: f('cadBairro'),
  cidade: f('cadCidade'), uf: f('cadUf'), senha: f('cadSenha'), senha2: f('cadSenha2'),
};
cad.nascimento.max = toISO(new Date());

const regrasCadastro = {
  nome: v => v.trim().split(/\s+/).length >= 2 ? '' : 'Informe nome e sobrenome.',
  cpf: v => isValidCPF(v) ? '' : 'CPF inválido.',
  nascimento: v => !v ? 'Informe sua data de nascimento.'
                  : idade(v) < 18 ? 'É preciso ter 18 anos ou mais para contratar.'
                  : idade(v) > 120 ? 'Data de nascimento inválida.' : '',
  telefone: v => isValidPhone(v) ? '' : 'Informe um número válido com DDD.',
  email: v => isEmail(v.trim()) ? '' : 'Informe um e-mail válido.',
  cep: v => v.replace(/\D/g, '').length !== 8 ? 'Informe o CEP com 8 números.'
         : cepNaoEncontrado ? 'CEP não encontrado. Confira os números.' : '',
  rua: v => v.trim().length >= 3 ? '' : 'Informe a rua.',
  numero: v => v.trim() ? '' : 'Obrigatório.',
  bairro: v => v.trim().length >= 2 ? '' : 'Informe o bairro.',
  cidade: v => v.trim().length >= 2 ? '' : 'Informe a cidade.',
  uf: v => v ? '' : 'Selecione.',
  senha: v => senhaForte(v) ? '' : 'Use no mínimo 8 caracteres, com letras e números.',
  senha2: v => !v ? 'Confirme a senha.' : v !== cad.senha.value ? 'As senhas não conferem.' : '',
};

const validarCampo = key => setError(cad[key], regrasCadastro[key](cad[key].value));

bindMask(cad.cpf, maskCPF, 11);
bindMask(cad.telefone, maskPhone, 11);
bindMask(cad.cep, v => maskCEP(v), 8);   // a busca do CEP roda logo depois, no próprio 'input'
Object.keys(cad).forEach(key => {
  cad[key].addEventListener('blur', () => { if (cad[key].value) validarCampo(key); });
  cad[key].addEventListener('input', () => { if (cad[key].classList.contains('invalid')) validarCampo(key); });
  cad[key].addEventListener('change', () => { if (cad[key].tagName === 'SELECT') validarCampo(key); });
});
cad.senha.addEventListener('input', () => { if (cad.senha2.value) validarCampo('senha2'); });

// ---------- CEP: busca o endereço no ViaCEP ----------
// Serviço gratuito e público: https://viacep.com.br — responde
// { logradouro, bairro, localidade, uf } ou { erro: true } quando o CEP não existe.
// Se a consulta falhar (sem internet, serviço fora do ar), o cadastro
// continua: a pessoa preenche o endereço à mão.
const cepStatus = f('cepStatus');
let cepNaoEncontrado = false;
let cepBuscado = '';
let enderecoDoCep = false; // true quando os campos foram preenchidos pelo CEP

const maskCEP = v => v.replace(/\D/g, '').slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2');

function travarCampo(input, travar) {
  input.classList.toggle('locked', travar);
  if (input.tagName === 'SELECT') input.disabled = travar; else input.readOnly = travar;
}
function liberarEndereco() {
  [cad.rua, cad.bairro, cad.cidade, cad.uf].forEach(i => travarCampo(i, false));
}
// apaga o que veio do CEP anterior quando a pessoa troca o CEP
function limparEnderecoDoCep() {
  if (!enderecoDoCep) return;
  [cad.rua, cad.bairro, cad.cidade, cad.uf].forEach(i => { i.value = ''; i.classList.remove('valid', 'invalid'); setError(i, ''); });
  enderecoDoCep = false;
}

async function buscarCEP(cep) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: ctrl.signal });
    if (!res.ok) throw new Error('falha');
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

cad.cep.addEventListener('input', async () => {
  const cep = cad.cep.value.replace(/\D/g, '');
  if (cep === cepBuscado) return;
  cepNaoEncontrado = false;
  setError(cad.cep, '');
  limparEnderecoDoCep();
  liberarEndereco();
  if (cep.length < 8) { cepStatus.textContent = ''; liberarEndereco(); cepBuscado = ''; return; }

  cepBuscado = cep;
  cepStatus.textContent = 'Buscando endereço…';
  try {
    const d = await buscarCEP(cep);
    if (cad.cep.value.replace(/\D/g, '') !== cep) return; // a pessoa já mudou o CEP
    if (d.erro) {
      cepNaoEncontrado = true;
      cepStatus.textContent = '';
      liberarEndereco();
      validarCampo('cep');
      return;
    }
    enderecoDoCep = true;
    // cidade e UF vêm do CEP e ficam travadas
    cad.cidade.value = d.localidade || '';
    cad.uf.value = d.uf || '';
    travarCampo(cad.cidade, !!d.localidade);
    travarCampo(cad.uf, !!d.uf);
    // rua e bairro: preenche, mas deixa editar (CEP de cidade inteira vem sem rua)
    cad.rua.value = d.logradouro || '';
    cad.bairro.value = d.bairro || '';
    ['rua', 'bairro', 'cidade', 'uf'].forEach(k => { if (cad[k].value) validarCampo(k); });
    setError(cad.cep, '');
    cepStatus.textContent = d.logradouro
      ? 'Endereço encontrado. Confira e informe o número.'
      : 'CEP geral da cidade: informe a rua e o bairro.';
    (d.logradouro ? cad.numero : cad.rua).focus();
  } catch {
    if (cad.cep.value.replace(/\D/g, '') !== cep) return;
    cepBuscado = '';
    liberarEndereco();
    cepStatus.textContent = 'Não foi possível consultar o CEP agora. Preencha o endereço manualmente.';
  }
});

function setLoading(formEl, loading, label) {
  const btn = formEl.querySelector('button[type="submit"]');
  btn.disabled = loading;
  btn.textContent = loading ? 'Aguarde…' : label;
}

// ---------- submit: cadastro ----------
cadastroForm.addEventListener('submit', async e => {
  e.preventDefault();
  hideAlert();
  const ok = Object.keys(cad).map(validarCampo).every(Boolean);
  if (!ok) { cadastroForm.querySelector('.invalid').focus(); return; }

  const dados = {
    nome: cad.nome.value.trim(),
    cpf: cad.cpf.value.replace(/\D/g, ''),
    data_nascimento: cad.nascimento.value,
    endereco: {
      cep: cad.cep.value.replace(/\D/g, ''),
      rua: cad.rua.value.trim(),
      numero: cad.numero.value.trim(),
      bairro: cad.bairro.value.trim(),
      cidade: cad.cidade.value.trim(),
      uf: cad.uf.value,
    },
    telefone: cad.telefone.value,
    email: cad.email.value.trim().toLowerCase(),
    senha: cad.senha.value,
  };

  setLoading(cadastroForm, true, 'Criar conta');
  try {
    const r = await authApi.cadastro(dados);
    showVerify(r.email, r.codigo_teste);
  } catch (err) {
    if (err.campo && cad[err.campo]) setError(cad[err.campo], err.message);
    showAlert(err.message);
  } finally {
    setLoading(cadastroForm, false, 'Criar conta');
  }
});

// ---------- confirmação do e-mail ----------
const verifyEmail = f('verifyEmail'), verifyCode = f('verifyCode'), resendBtn = f('resendCode');
let emailPendente = null;
let resendTimer = null;

function avisoTeste(codigo) {
  if (USE_FAKE_API && codigo) showAlert(`Modo de teste: nenhum e-mail é enviado de verdade. Use o código ${codigo}.`, true);
}

function iniciarEspera(segundos = 60) {
  clearInterval(resendTimer);
  let t = segundos;
  resendBtn.disabled = true;
  resendBtn.textContent = `Reenviar código (${t}s)`;
  resendTimer = setInterval(() => {
    t--;
    if (t <= 0) { clearInterval(resendTimer); resendBtn.disabled = false; resendBtn.textContent = 'Reenviar código'; }
    else resendBtn.textContent = `Reenviar código (${t}s)`;
  }, 1000);
}

function showVerify(email, codigoTeste) {
  emailPendente = email;
  loginForm.hidden = true;
  cadastroForm.hidden = true;
  verifyForm.hidden = false;
  authTabs.hidden = true;
  authTitle.textContent = 'Confirme seu e-mail';
  verifyEmail.textContent = email;
  verifyForm.reset();
  setError(verifyCode, '');
  verifyCode.classList.remove('valid');
  hideAlert();
  avisoTeste(codigoTeste);
  iniciarEspera();
  setTimeout(() => verifyCode.focus(), 50);
}

verifyCode.addEventListener('input', () => {
  verifyCode.value = verifyCode.value.replace(/\D/g, '').slice(0, 6);
  if (verifyCode.classList.contains('invalid')) setError(verifyCode, '');
  if (verifyCode.value.length === 6) verifyForm.requestSubmit(); // envia sozinho ao completar
});

verifyForm.addEventListener('submit', async e => {
  e.preventDefault();
  if (!/^\d{6}$/.test(verifyCode.value)) { setError(verifyCode, 'Digite os 6 números do código.'); return; }
  hideAlert();
  setLoading(verifyForm, true, 'Confirmar e criar conta');
  try {
    const user = await authApi.confirmarCadastro(emailPendente, verifyCode.value);
    clearInterval(resendTimer);
    cadastroForm.reset();
    cadastroForm.querySelectorAll('.valid, .invalid').forEach(i => i.classList.remove('valid', 'invalid'));
    liberarEndereco(); cepStatus.textContent = ''; cepBuscado = ''; cepNaoEncontrado = false; enderecoDoCep = false;
    verifyForm.reset();
    emailPendente = null;
    onLoggedIn(user, 'E-mail confirmado! Conta criada e você já está conectado.');
  } catch (err) {
    setError(verifyCode, err.message);
    verifyCode.select();
  } finally {
    setLoading(verifyForm, false, 'Confirmar e criar conta');
  }
});

resendBtn.addEventListener('click', async () => {
  if (!emailPendente) return;
  hideAlert();
  resendBtn.disabled = true;
  try {
    const r = await authApi.reenviarCodigo(emailPendente);
    verifyForm.reset();
    setError(verifyCode, '');
    showAlert('Enviamos um código novo para o seu e-mail.', true);
    avisoTeste(r.codigo_teste);
    iniciarEspera();
    verifyCode.focus();
  } catch (err) {
    showAlert(err.message);
    resendBtn.disabled = false;
  }
});

f('editEmail').addEventListener('click', () => {
  clearInterval(resendTimer);
  switchTab('cadastro');         // os dados digitados continuam no formulário
  setTimeout(() => { cad.email.focus(); cad.email.select(); }, 60);
});

// ---------- submit: login ----------
const loginEmail = f('loginEmail'), loginSenha = f('loginSenha');
loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  hideAlert();
  const okEmail = setError(loginEmail, isEmail(loginEmail.value.trim()) ? '' : 'Informe um e-mail válido.');
  const okSenha = setError(loginSenha, loginSenha.value ? '' : 'Informe sua senha.');
  if (!okEmail || !okSenha) return;

  setLoading(loginForm, true, 'Entrar');
  try {
    const user = await authApi.login(loginEmail.value.trim().toLowerCase(), loginSenha.value);
    loginForm.reset();
    loginForm.querySelectorAll('input').forEach(i => i.classList.remove('valid', 'invalid'));
    onLoggedIn(user, `Bem-vindo(a) de volta, ${user.nome.split(' ')[0]}!`);
  } catch (err) {
    loginSenha.value = '';
    showAlert(err.message);
  } finally {
    setLoading(loginForm, false, 'Entrar');
  }
});

// ---------- sessão ----------
function renderAccount() {
  if (currentUser) {
    accountLabel.textContent = 'Olá, ' + currentUser.nome.split(' ')[0];
    accountEmail.textContent = currentUser.email;
    accountBtn.setAttribute('aria-label', 'Minha conta');
  } else {
    accountLabel.textContent = 'Entrar';
    accountBtn.setAttribute('aria-label', 'Entrar ou criar conta');
    accountMenu.hidden = true;
  }
}

function onLoggedIn(user, msg) {
  currentUser = user;
  if (USE_FAKE_API) { try { sessionStorage.setItem('radianceUser', JSON.stringify(user)); } catch {} }
  renderAccount();
  showAlert(msg, true);

  const continuar = pendingReserva;
  setTimeout(() => {
    closeAuth();
    notifyAuth(continuar); // a página de reserva usa para preencher e seguir com o pedido
  }, 900);
}

accountBtn.addEventListener('click', () => {
  if (!currentUser) { openAuth('login'); return; }
  accountMenu.hidden = !accountMenu.hidden;
  accountBtn.setAttribute('aria-expanded', String(!accountMenu.hidden));
});
document.addEventListener('click', e => {
  if (!e.target.closest('.account')) { accountMenu.hidden = true; accountBtn.setAttribute('aria-expanded', 'false'); }
});
document.getElementById('menuReserva').addEventListener('click', () => { accountMenu.hidden = true; });

document.getElementById('logoutBtn').addEventListener('click', async () => {
  try { await authApi.logout(); } catch {}
  currentUser = null;
  try { sessionStorage.removeItem('radianceUser'); } catch {}
  renderAccount();
  notifyAuth(false);
});

(async function initSession() {
  currentUser = await authApi.me();
  renderAccount();
  notifyAuth(false);
})();
