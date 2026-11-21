// =====================================================================
// RADIANCE — área administrativa (admin.html)
// Login do administrador, registro manual de reservas (feitas por redes
// sociais, telefone ou presencialmente) e lista de reservas.
// Fala com as rotas /api/admin/* do back-end (backend/admin.py).
// =====================================================================

// ---------- utilitários de máscara e validação (os mesmos de main.js) ----------
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

const maskCEP = v => v.replace(/\D/g, '').slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2');

// =====================================================================
// LÓGICA DA ÁREA ADMINISTRATIVA
// =====================================================================
const $ = id => document.getElementById(id);
const SERVIDOR = location.protocol !== 'file:';
const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// ---------- chamadas à API ----------
async function api(method, url, body) {
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
    err.status = res.status;
    throw err;
  }
  return data;
}

// ---------- tema (mesma escolha do site) ----------
const themeToggle = $('themeToggle');
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

// ---------- mensagens de erro nos campos ----------
function setErr(el, msg) {
  const box = el.closest('.field');
  const err = box && box.querySelector('.field-error');
  el.classList.toggle('invalid', !!msg);
  if (err) { err.textContent = msg || ''; err.classList.toggle('show', !!msg); }
}
function limparErros() {
  document.querySelectorAll('#reservaForm .invalid').forEach(el => el.classList.remove('invalid'));
  document.querySelectorAll('#reservaForm .field-error').forEach(e => { e.textContent = ''; e.classList.remove('show'); });
}

// ---------- telas ----------
const telas = { sem: $('semServidor'), login: $('telaLogin'), painel: $('telaPainel') };
function mostrarTela(qual) {
  Object.entries(telas).forEach(([k, el]) => { el.hidden = k !== qual; });
  $('admUser').hidden = $('admSair').hidden = qual !== 'painel';
}

let admin = null;

async function iniciar() {
  if (!SERVIDOR) { mostrarTela('sem'); return; }
  try {
    admin = await api('GET', '/api/admin/me');
    entrarNoPainel();
  } catch {
    mostrarTela('login');
    setTimeout(() => $('admEmail').focus(), 50);
  }
}

function entrarNoPainel() {
  $('admUser').textContent = admin.nome;
  mostrarTela('painel');
  carregarOcupadas();
  carregarLista();
}

// ---------- login / logout ----------
const loginAlerta = $('loginAlerta');
$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  loginAlerta.classList.remove('show');
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  try {
    admin = await api('POST', '/api/admin/login', {
      email: $('admEmail').value.trim().toLowerCase(),
      senha: $('admSenha').value,
    });
    $('admSenha').value = '';
    entrarNoPainel();
  } catch (err) {
    loginAlerta.textContent = err.message;
    loginAlerta.classList.add('show');
    $('admSenha').value = '';
    $('admSenha').focus();
  } finally {
    btn.disabled = false;
  }
});

$('admSair').addEventListener('click', async () => {
  try { await api('POST', '/api/admin/logout'); } catch {}
  admin = null;
  mostrarTela('login');
});

// Qualquer 401 no meio do uso = sessão expirou: volta para o login.
function tratarSessao(err) {
  if (err.status === 401) {
    admin = null;
    mostrarTela('login');
    loginAlerta.textContent = 'Sua sessão expirou. Entre de novo.';
    loginAlerta.classList.add('show');
    return true;
  }
  return false;
}

// ---------- abas ----------
document.querySelectorAll('.adm-aba').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.adm-aba').forEach(x => {
    const ativa = x === b;
    x.classList.toggle('ativa', ativa);
    x.setAttribute('aria-selected', String(ativa));
  });
  $('abaNova').hidden = b.dataset.aba !== 'nova';
  $('abaLista').hidden = b.dataset.aba !== 'lista';
  if (b.dataset.aba === 'lista') carregarLista();
}));

// =====================================================================
// 1. CLIENTE
// =====================================================================
let clienteSel = null;
const tipoCliente = () => document.querySelector('input[name=tipoCliente]:checked').value;

document.querySelectorAll('input[name=tipoCliente]').forEach(r => r.addEventListener('change', () => {
  const novo = tipoCliente() === 'novo';
  $('blocoNovo').hidden = !novo;
  $('blocoExistente').hidden = novo;
  limparErros();
  (novo ? $('n_nome') : $('buscaCliente')).focus();
}));

function formatarCPF(c) { return maskCPF(c || ''); }

let buscaTimer = null, buscaSeq = 0;
$('buscaCliente').addEventListener('input', () => {
  clearTimeout(buscaTimer);
  setErr($('buscaCliente'), '');
  const q = $('buscaCliente').value.trim();
  if (q.length < 2) { $('resultadosBusca').hidden = true; return; }
  buscaTimer = setTimeout(() => buscarClientes(q), 280);
});

async function buscarClientes(q) {
  const seq = ++buscaSeq;
  try {
    const lista = await api('GET', '/api/admin/clientes?q=' + encodeURIComponent(q));
    if (seq !== buscaSeq) return;               // chegou uma busca mais nova
    const ul = $('resultadosBusca');
    ul.replaceChildren();
    if (!lista.length) {
      const li = document.createElement('li');
      const p = document.createElement('span');
      p.className = 'adm-nada';
      p.textContent = 'Nenhum cliente encontrado. Use "Novo cliente".';
      li.append(p); ul.append(li);
    }
    lista.forEach(c => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      const nome = document.createElement('span');
      nome.textContent = c.nome;
      const info = document.createElement('small');
      info.textContent = `${formatarCPF(c.cpf)} · ${maskPhone(c.telefone)}${c.tem_conta ? ' · conta no site' : ''}`;
      b.append(nome, info);
      b.addEventListener('click', () => selecionarCliente(c));
      li.append(b); ul.append(li);
    });
    ul.hidden = false;
  } catch (err) {
    tratarSessao(err);
  }
}

function selecionarCliente(c) {
  clienteSel = c;
  $('selNome').textContent = c.nome;
  $('selInfo').textContent = `CPF ${formatarCPF(c.cpf)} · ${maskPhone(c.telefone)}` +
    (c.email ? ` · ${c.email}` : '') + (c.cidade ? ` · ${c.cidade}/${c.uf}` : '');
  $('clienteSelecionado').hidden = false;
  $('campoBusca').hidden = true;
  $('resultadosBusca').hidden = true;
  setErr($('buscaCliente'), '');
}

$('trocarCliente').addEventListener('click', () => {
  clienteSel = null;
  $('clienteSelecionado').hidden = true;
  $('campoBusca').hidden = false;
  $('buscaCliente').value = '';
  $('buscaCliente').focus();
});

// ---------- novo cliente: máscaras e CEP ----------
bindMask($('n_cpf'), maskCPF, 11);
bindMask($('n_telefone'), maskPhone, 11);
bindMask($('n_cep'), maskCEP, 8);

let cepBuscado = '', enderecoDoCep = false;
const camposEndereco = ['n_rua', 'n_bairro', 'n_cidade', 'n_uf'].map($);
function travar(el, sim) { el.classList.toggle('locked', sim); if (el.tagName === 'SELECT') el.disabled = sim; else el.readOnly = sim; }

$('n_cep').addEventListener('input', async () => {
  const cep = $('n_cep').value.replace(/\D/g, '');
  if (cep === cepBuscado) return;
  setErr($('n_cep'), '');
  if (enderecoDoCep) { camposEndereco.forEach(el => { el.value = ''; }); enderecoDoCep = false; }
  camposEndereco.forEach(el => travar(el, false));
  if (cep.length < 8) { cepBuscado = ''; $('cepStatus').textContent = ''; return; }
  cepBuscado = cep;
  $('cepStatus').textContent = 'Buscando endereço…';
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: ctrl.signal });
    clearTimeout(t);
    const d = await res.json();
    if ($('n_cep').value.replace(/\D/g, '') !== cep) return;
    if (d.erro) { $('cepStatus').textContent = ''; setErr($('n_cep'), 'CEP não encontrado.'); return; }
    $('n_rua').value = d.logradouro || '';
    $('n_bairro').value = d.bairro || '';
    $('n_cidade').value = d.localidade || '';
    $('n_uf').value = d.uf || '';
    travar($('n_cidade'), !!d.localidade);
    travar($('n_uf'), !!d.uf);
    enderecoDoCep = true;
    $('cepStatus').textContent = d.logradouro ? 'Endereço encontrado. Confira e informe o número.' : 'CEP geral da cidade: informe a rua e o bairro.';
    (d.logradouro ? $('n_numero') : $('n_rua')).focus();
  } catch {
    cepBuscado = '';
    $('cepStatus').textContent = 'Não foi possível consultar o CEP agora. Preencha o endereço manualmente.';
  }
});

// =====================================================================
// 2. EVENTO
// =====================================================================
function atualizarDuracao() {
  const multi = $('r_duracao').value === 'multipla';
  $('campoTurno').hidden = multi;
  $('campoFinal').hidden = !multi;
  $('lblInicio').textContent = multi ? 'Primeiro dia' : 'Data do evento';
  verificarData();
}
$('r_duracao').addEventListener('change', atualizarDuracao);
$('r_inicio').min = $('r_final').min = hojeISO();
$('r_inicio').addEventListener('change', () => {
  if ($('r_final').value && $('r_final').value < $('r_inicio').value) $('r_final').value = '';
  $('r_final').min = $('r_inicio').value || hojeISO();
  verificarData();
});
$('r_final').addEventListener('change', verificarData);

// Avisa na hora se a data já está ocupada (o servidor confere de novo ao salvar).
let ocupadas = [];
async function carregarOcupadas() {
  try { ocupadas = await api('GET', '/api/datas-ocupadas'); } catch { ocupadas = []; }
  verificarData();
}
function verificarData() {
  const ini = $('r_inicio').value;
  const fim = $('r_duracao').value === 'multipla' ? ($('r_final').value || ini) : ini;
  const aviso = $('avisoData');
  const choque = ini && ocupadas.find(o => o.data_inicio_evento <= fim && o.data_final_evento >= ini);
  aviso.hidden = !choque;
  if (choque) aviso.textContent = 'Atenção: já existe uma reserva ocupando essa data. Escolha outra.';
}

// =====================================================================
// 3. STATUS E VALORES
// =====================================================================
const DICAS_STATUS = {
  pendente: 'Não bloqueia a data no calendário. O valor pode ficar em branco.',
  aguardando_assinatura: 'Bloqueia a data. Informe o valor total.',
  confirmado: 'Bloqueia a data. Informe o valor total.',
};
function atualizarStatus() { $('dicaStatus').textContent = DICAS_STATUS[$('r_status').value]; }
$('r_status').addEventListener('change', atualizarStatus);

$('temSinal').addEventListener('change', () => {
  $('blocoSinal').hidden = !$('temSinal').checked;
  if ($('temSinal').checked && !$('s_data').value) $('s_data').value = hojeISO();
});
$('s_data').max = hojeISO();

// "3.500,00" → 3500 (número) para fazer contas
function paraNumero(v) {
  let t = String(v || '').replace(/[R$\s]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}
const brl = n => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

$('sinal30').addEventListener('click', () => {
  const total = paraNumero($('r_valor').value);
  if (!total || total <= 0) { setErr($('r_valor'), 'Informe o valor total primeiro.'); $('r_valor').focus(); return; }
  $('s_valor').value = brl(Math.round(total * 30) / 100);
  setErr($('s_valor'), '');
});

// =====================================================================
// ENVIAR
// =====================================================================
const CAMPOS = {
  // cliente novo
  nome: 'n_nome', cpf: 'n_cpf', nascimento: 'n_nascimento', telefone: 'n_telefone', email: 'n_email',
  cep: 'n_cep', rua: 'n_rua', numero: 'n_numero', bairro: 'n_bairro', cidade: 'n_cidade', uf: 'n_uf',
  cliente: 'buscaCliente',
  // reserva
  origem: 'r_origem', tipo: 'r_tipo', turno: 'r_turno', data: 'r_inicio', convidados: 'r_convidados',
  status: 'r_status', valor_total: 'r_valor', observacao: 'r_obs',
  sinal_valor: 's_valor', sinal_forma: 's_forma', sinal_data: 's_data',
};

function conferirAntes() {
  // Só o que dá para checar rápido aqui; o servidor valida tudo de novo.
  const faltas = [];
  const exigir = (id, msg) => { if (!$(id).value.trim()) { setErr($(id), msg); faltas.push(id); } };
  if (tipoCliente() === 'existente') {
    if (!clienteSel) { setErr($('buscaCliente'), 'Busque e selecione o cliente.'); faltas.push('buscaCliente'); }
  } else {
    exigir('n_nome', 'Informe nome e sobrenome.');
    if (!isValidCPF($('n_cpf').value)) { setErr($('n_cpf'), 'CPF inválido.'); faltas.push('n_cpf'); }
    exigir('n_nascimento', 'Informe a data de nascimento.');
    if (!isValidPhone($('n_telefone').value)) { setErr($('n_telefone'), 'Informe um número válido com DDD.'); faltas.push('n_telefone'); }
    if ($('n_cep').value.replace(/\D/g, '').length !== 8) { setErr($('n_cep'), 'Informe o CEP com 8 números.'); faltas.push('n_cep'); }
    exigir('n_rua', 'Informe a rua.'); exigir('n_numero', 'Obrigatório.');
    exigir('n_bairro', 'Informe o bairro.'); exigir('n_cidade', 'Informe a cidade.');
    if (!$('n_uf').value) { setErr($('n_uf'), 'Selecione.'); faltas.push('n_uf'); }
  }
  if (!$('r_origem').value) { setErr($('r_origem'), 'Selecione.'); faltas.push('r_origem'); }
  if (!$('r_tipo').value) { setErr($('r_tipo'), 'Selecione.'); faltas.push('r_tipo'); }
  if ($('r_duracao').value === 'unica' && !$('r_turno').value) { setErr($('r_turno'), 'Selecione o turno.'); faltas.push('r_turno'); }
  if (!$('r_inicio').value) { setErr($('r_inicio'), 'Informe a data.'); faltas.push('r_inicio'); }
  if ($('r_duracao').value === 'multipla' && (!$('r_final').value || $('r_final').value <= $('r_inicio').value)) {
    setErr($('r_inicio'), 'Para mais de um dia, o último dia deve ser depois do primeiro.'); faltas.push('r_inicio');
  }
  exigir('r_convidados', 'Informe o número de convidados.');
  if ($('r_status').value !== 'pendente') exigir('r_valor', 'Informe o valor total.');
  if ($('temSinal').checked) {
    exigir('s_valor', 'Informe o valor do sinal.');
    if (!$('s_forma').value) { setErr($('s_forma'), 'Selecione.'); faltas.push('s_forma'); }
  }
  if (faltas.length) $(faltas[0]).focus();
  return !faltas.length;
}

function montarPedido() {
  const multi = $('r_duracao').value === 'multipla';
  const p = {
    origem: $('r_origem').value,
    tipo_evento: $('r_tipo').value,
    data_inicio_evento: $('r_inicio').value,
    data_final_evento: multi ? $('r_final').value : $('r_inicio').value,
    turno: multi ? null : $('r_turno').value,
    num_convidados: Number($('r_convidados').value),
    status: $('r_status').value,
    valor_total: $('r_valor').value.trim(),
    observacao: $('r_obs').value.trim(),
    sinal: $('temSinal').checked ? { valor: $('s_valor').value.trim(), forma: $('s_forma').value, data: $('s_data').value } : null,
  };
  if (tipoCliente() === 'existente') {
    p.cliente_id = clienteSel.id;
  } else {
    p.cliente = {
      nome: $('n_nome').value.trim(),
      cpf: $('n_cpf').value,
      data_nascimento: $('n_nascimento').value,
      telefone: $('n_telefone').value,
      email: $('n_email').value.trim(),
      endereco: {
        cep: $('n_cep').value, rua: $('n_rua').value.trim(), numero: $('n_numero').value.trim(),
        bairro: $('n_bairro').value.trim(), cidade: $('n_cidade').value.trim(), uf: $('n_uf').value,
      },
    };
  }
  return p;
}

const reservaMsg = $('reservaMsg');
function mensagem(texto, erro) {
  reservaMsg.textContent = texto;
  reservaMsg.classList.toggle('erro', !!erro);
  reservaMsg.classList.add('show');
}

$('reservaForm').addEventListener('submit', async e => {
  e.preventDefault();
  limparErros();
  reservaMsg.classList.remove('show');
  if (!conferirAntes()) { mensagem('Confira os campos destacados.', true); return; }

  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  try {
    const r = await api('POST', '/api/admin/reservas', montarPedido());
    const statusTxt = { pendente: 'pendente', aguardando_assinatura: 'aguardando assinatura', confirmado: 'confirmada' }[r.status];
    mensagem(`Reserva nº ${r.id} registrada (${statusTxt}) para ${r.cliente.nome}.`);
    limparFormulario();
    carregarOcupadas();
  } catch (err) {
    if (tratarSessao(err)) return;
    const id = CAMPOS[err.campo];
    if (id) { setErr($(id), err.message); $(id).focus(); }
    mensagem(err.message, true);
  } finally {
    btn.disabled = false;
  }
});

function limparFormulario() {
  const msg = reservaMsg.textContent, msgErro = reservaMsg.classList.contains('erro');
  $('reservaForm').reset();
  limparErros();
  clienteSel = null;
  $('clienteSelecionado').hidden = true;
  $('campoBusca').hidden = false;
  $('resultadosBusca').hidden = true;
  $('blocoNovo').hidden = true;
  $('blocoExistente').hidden = false;
  $('blocoSinal').hidden = true;
  camposEndereco.forEach(el => travar(el, false));
  cepBuscado = ''; enderecoDoCep = false; $('cepStatus').textContent = '';
  atualizarDuracao(); atualizarStatus();
  mensagem(msg, msgErro);                       // mantém o aviso de sucesso visível
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// =====================================================================
// LISTA DE RESERVAS
// =====================================================================
const ROTULO_STATUS = {
  pendente: 'Pendente', aguardando_assinatura: 'Aguardando assinatura', confirmado: 'Confirmado',
  cancelado: 'Cancelado', concluido: 'Concluído',
};
const ROTULO_ORIGEM = {
  site: 'Site', presencial: 'Presencial', whatsapp: 'WhatsApp', instagram: 'Instagram',
  facebook: 'Facebook', telefone: 'Telefone', outro: 'Outro',
};
const dataBR = iso => iso.split('-').reverse().join('/');

let reservas = [];
async function carregarLista() {
  try {
    reservas = await api('GET', '/api/admin/reservas');
    desenharLista();
  } catch (err) {
    tratarSessao(err);
  }
}

function celula(texto, sub, classe) {
  const td = document.createElement('td');
  if (classe) td.className = classe;
  td.append(document.createTextNode(texto));
  if (sub) { const s = document.createElement('small'); s.textContent = sub; td.append(s); }
  return td;
}

function desenharLista() {
  const q = $('filtroTexto').value.trim().toLowerCase();
  const qDig = q.replace(/\D/g, '');
  const st = $('filtroStatus').value;
  const tbody = $('listaReservas');
  tbody.replaceChildren();
  const filtradas = reservas.filter(r =>
    (!st || r.status === st) &&
    (!q || r.cliente.toLowerCase().includes(q) || (qDig.length >= 3 && r.telefone.includes(qDig))));
  filtradas.forEach(r => {
    const tr = document.createElement('tr');
    const data = r.data_inicio_evento === r.data_final_evento
      ? dataBR(r.data_inicio_evento) : `${dataBR(r.data_inicio_evento)} a ${dataBR(r.data_final_evento)}`;
    tr.append(
      celula(String(r.id)),
      celula(data, r.turno || 'Vários dias'),
      celula(r.cliente, maskPhone(r.telefone)),
      celula(r.tipo_evento),
      celula(String(r.num_convidados)),
    );
    const tdSt = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = 'adm-status st-' + r.status;
    badge.textContent = ROTULO_STATUS[r.status] || r.status;
    tdSt.append(badge);
    tr.append(tdSt,
      celula(r.valor_total ? 'R$ ' + brl(r.valor_total) : '—', null, 'dinheiro'),
      celula(Number(r.total_pago) > 0 ? 'R$ ' + brl(r.total_pago) : '—', null, 'dinheiro'),
      celula(ROTULO_ORIGEM[r.origem] || r.origem, r.registrado_por ? 'por ' + r.registrado_por : ''),
    );
    tbody.append(tr);
  });
  $('listaVazia').hidden = filtradas.length > 0;
}
$('filtroTexto').addEventListener('input', desenharLista);
$('filtroStatus').addEventListener('change', desenharLista);
$('atualizarLista').addEventListener('click', carregarLista);

// ---------- começo ----------
atualizarDuracao();
atualizarStatus();
iniciar();
