// =====================================================================
// RADIANCE — página de reserva (calendário e formulário)
// Depende de assets/main.js (maskPhone, toISO, currentUser, requireLogin…)
// =====================================================================

// ---------- WhatsApp: máscara e validação ----------
const whatsappInput = document.getElementById('whatsapp');
const whatsappError = document.getElementById('whatsappError');

function validatePhoneField() {
  const valid = isValidPhone(whatsappInput.value);
  whatsappInput.classList.toggle('invalid', !valid && whatsappInput.value.length > 0);
  whatsappInput.classList.toggle('valid', valid);
  whatsappError.classList.toggle('show', !valid && whatsappInput.value.length > 0);
  whatsappInput.setCustomValidity(valid ? '' : 'Informe um número de WhatsApp válido com DDD.');
  return valid;
}

// máscara que deixa editar qualquer parte do número (ver bindMask em main.js)
bindMask(whatsappInput, maskPhone, 11, validatePhoneField);
whatsappInput.addEventListener('blur', validatePhoneField);

// ---------- Calendário customizado (datas ocupadas) ----------
// (declarados aqui porque o calendário já usa esses campos ao renderizar)
const duracaoSelect = document.getElementById('duracao');
const dataInicioInput = document.getElementById('dataInicio');
const dataFinalInput = document.getElementById('dataFinal');
const turnoField = document.getElementById('turnoField');
const turnoSelect = document.getElementById('turno');
const calendarGrid = document.getElementById('calendarGrid');
const calMonthLabel = document.getElementById('calMonthLabel');
const calPrev = document.getElementById('calPrev');
const calNext = document.getElementById('calNext');
const calStatus = document.getElementById('calStatus');
const dataError = document.getElementById('dataError');

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho',
               'Agosto','Setembro','Outubro','Novembro','Dezembro'];

const hoje = new Date();
hoje.setHours(0, 0, 0, 0);
let viewYear = hoje.getFullYear();
let viewMonth = hoje.getMonth();
let occupiedSet = new Set();     // ISO 'YYYY-MM-DD' dos dias já reservados
let selStart = null;             // usado no modo "um dia"
let selectedDates = new Set();   // usado no modo "mais de um dia" — seleção manual, dia a dia


// GET /api/datas-ocupadas → [{ data_inicio_evento, data_final_evento }] (YYYY-MM-DD),
// só reservas que ocupam a data. No modo de teste (arquivo aberto direto),
// usa datas de exemplo.
async function fetchDatasOcupadas() {
  if (!USE_FAKE_API) {
    try {
      const res = await fetch('/api/datas-ocupadas', { credentials: 'include' });
      if (!res.ok) throw new Error('falha');
      return await res.json();
    } catch {
      calStatus.textContent = 'Não foi possível carregar as datas ocupadas agora.';
      return [];
    }
  }
  return new Promise(resolve => {
    setTimeout(() => {
      const y = hoje.getFullYear(), m = hoje.getMonth();
      const d = (offsetMonth, day) => toISO(new Date(y, m + offsetMonth, day));
      resolve([
        { data_inicio_evento: d(0, 12), data_final_evento: d(0, 12) },
        { data_inicio_evento: d(0, 13), data_final_evento: d(0, 13) },
        { data_inicio_evento: d(0, 20), data_final_evento: d(0, 22) },
        { data_inicio_evento: d(1, 5),  data_final_evento: d(1, 5)  },
        { data_inicio_evento: d(1, 18), data_final_evento: d(1, 19) },
      ]);
    }, 250);
  });
}

function expandOccupied(reservas) {
  const set = new Set();
  reservas.forEach(r => {
    let cur = fromISO(r.data_inicio_evento);
    const fim = fromISO(r.data_final_evento);
    while (cur <= fim) { set.add(toISO(cur)); cur.setDate(cur.getDate() + 1); }
  });
  return set;
}

function renderCalendar() {
  calMonthLabel.textContent = `${MESES[viewMonth]} ${viewYear}`;
  calendarGrid.innerHTML = '';

  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  for (let i = 0; i < firstWeekday; i++) {
    const empty = document.createElement('span');
    empty.className = 'cal-day empty';
    calendarGrid.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(viewYear, viewMonth, day);
    const iso = toISO(date);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cal-day';
    btn.textContent = day;

    const isPast = date < hoje;
    const isOccupied = occupiedSet.has(iso);

    if (isPast) btn.classList.add('past');
    if (iso === toISO(hoje)) btn.classList.add('today');
    if (isOccupied) btn.classList.add('occupied');

    const multipla = duracaoSelect.value === 'multipla';
    const isSelected = multipla ? selectedDates.has(iso) : (selStart && iso === toISO(selStart));
    if (isSelected) btn.classList.add('selected');

    if (!isPast && !isOccupied) btn.addEventListener('click', () => onDayClick(date));
    calendarGrid.appendChild(btn);
  }
}

function onDayClick(date) {
  const multipla = duracaoSelect.value === 'multipla';
  calStatus.textContent = '';
  const iso = toISO(date);

  if (!multipla) {
    selStart = date;
    commitSelection();
    return;
  }

  // Seleção manual, mas restrita a dias seguidos (sem buracos no meio).
  if (selectedDates.size === 0) {
    selectedDates.add(iso);
    commitSelection();
    return;
  }

  const datas = [...selectedDates].sort();
  const minDate = fromISO(datas[0]);
  const maxDate = fromISO(datas[datas.length - 1]);
  const antes = new Date(minDate); antes.setDate(antes.getDate() - 1);
  const depois = new Date(maxDate); depois.setDate(depois.getDate() + 1);

  if (selectedDates.has(iso)) {
    // só deixa desmarcar pelas pontas, senão abriria um buraco no meio
    if (iso === datas[0] || iso === datas[datas.length - 1]) {
      selectedDates.delete(iso);
    } else {
      calStatus.textContent = 'Só é possível remover pelas pontas do período, para manter os dias seguidos.';
      return;
    }
  } else if (iso === toISO(antes) || iso === toISO(depois)) {
    selectedDates.add(iso); // estende o período por um dos lados
  } else {
    selectedDates = new Set([iso]); // não é dia seguido: reinicia a seleção
    calStatus.textContent = 'Selecione dias seguidos, sem intervalos — a seleção foi reiniciada nesse dia.';
  }

  commitSelection();
}

function commitSelection() {
  renderCalendar();
  const multipla = duracaoSelect.value === 'multipla';

  if (multipla) {
    const datas = [...selectedDates].sort();
    dataInicioInput.value = datas.length ? datas[0] : '';
    dataFinalInput.value = datas.length ? datas[datas.length - 1] : '';
  } else {
    dataInicioInput.value = selStart ? toISO(selStart) : '';
    dataFinalInput.value = '';
  }

  dataError.classList.remove('show');
  dataInicioInput.dispatchEvent(new Event('change', { bubbles: true }));
}

function resetSelection() {
  selStart = null;
  selectedDates = new Set();
  dataInicioInput.value = '';
  dataFinalInput.value = '';
  calStatus.textContent = '';
  renderCalendar();
}

calPrev.addEventListener('click', () => {
  viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; }
  renderCalendar();
});
calNext.addEventListener('click', () => {
  viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; }
  renderCalendar();
});

(async function initCalendar() {
  renderCalendar();
  const reservas = await fetchDatasOcupadas();
  occupiedSet = expandOccupied(reservas);
  renderCalendar();
})();

// ---------- Duração: mostra/esconde turno ----------

function toggleDataFinal() {
  const multipla = duracaoSelect.value === 'multipla';
  resetSelection();

  // Com mais de um dia, o evento ocupa diurno e noturno — turno não se aplica.
  turnoField.classList.toggle('is-hidden', multipla);
  turnoSelect.required = !multipla;
  if (multipla) turnoSelect.value = 'Diurno';
}
duracaoSelect.addEventListener('change', toggleDataFinal);
toggleDataFinal();

// ---------- Booking form: live preview ----------
const form = document.getElementById('bookingForm');
const pv = {
  nome: document.getElementById('pvNome'),
  tipo: document.getElementById('pvTipo'),
  dataInicio: document.getElementById('pvDataInicio'),
  dataFinal: document.getElementById('pvDataFinal'),
  turno: document.getElementById('pvTurno'),
  convidados: document.getElementById('pvConvidados'),
  whats: document.getElementById('pvWhats'),
};

function formatDate(value) {
  if (!value) return '—';
  const [y, m, d] = value.split('-');
  return `${d}/${m}/${y}`;
}

function updatePreview() {
  const data = new FormData(form);
  const multipla = data.get('duracao') === 'multipla';
  pv.nome.textContent = data.get('nome') || '—';
  pv.tipo.textContent = data.get('tipo') || '—';
  pv.dataInicio.textContent = formatDate(data.get('dataInicio'));
  pv.dataFinal.textContent = multipla ? formatDate(data.get('dataFinal')) : formatDate(data.get('dataInicio'));
  pv.turno.textContent = multipla ? 'Não se aplica' : (data.get('turno') || 'Diurno');
  pv.convidados.textContent = data.get('convidados') ? data.get('convidados') + ' pessoas' : '—';
  pv.whats.textContent = data.get('whatsapp') || '—';
}
form.addEventListener('input', updatePreview);
form.addEventListener('change', updatePreview);

// ---------- Booking form: submit ----------
// O valor total NÃO é calculado aqui. O front-end apenas envia os dados
// da reserva (datas, turno, convidados etc.) para o back-end,
// que calcula o valor_total e grava o registro completo no banco de dados.
form.addEventListener('submit', async function (e) {
  e.preventDefault();

  if (!validatePhoneField()) {
    whatsappInput.focus();
    whatsappInput.reportValidity();
    return;
  }

  if (!dataInicioInput.value) {
    dataError.classList.add('show');
    document.getElementById('calendar').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  // A reserva fica vinculada a um cliente (aluguel.id_cliente),
  // então é preciso estar logado para enviar o pedido.
  if (!currentUser) {
    requireLogin('Para enviar o pedido de reserva, entre na sua conta ou crie uma — leva menos de um minuto.');
    return;
  }

  const data = new FormData(form);
  const multipla = data.get('duracao') === 'multipla';

  // O cliente vem da sessão no servidor (não do formulário).
  const payload = {
    nome: data.get('nome'),
    whatsapp: data.get('whatsapp'),
    tipo_evento: data.get('tipo'),
    data_inicio_evento: data.get('dataInicio'),
    data_final_evento: multipla ? data.get('dataFinal') : data.get('dataInicio'),
    turno: multipla ? null : data.get('turno'),
    num_convidados: Number(data.get('convidados')),
    mensagem: data.get('mensagem') || null,
  };

  const msg = document.getElementById('formMsg');
  const btn = form.querySelector('button[type="submit"]');
  const mostrar = (texto, erro) => {
    msg.textContent = texto;
    msg.classList.toggle('erro', !!erro);
    msg.classList.add('show');
    msg.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  btn.disabled = true;
  try {
    if (USE_FAKE_API) {
      await new Promise(r => setTimeout(r, 500)); // modo de teste: finge que enviou
    } else {
      // O servidor valida tudo de novo, confere se a data ainda está livre
      // e grava em `aluguel` com status "pendente".
      const res = await fetch('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // envia o cookie de sessão do login
        body: JSON.stringify(payload),
      });
      const resp = await res.json().catch(() => ({}));
      if (res.status === 401) {               // sessão expirou
        currentUser = null;
        renderAccount();
        requireLogin('Sua sessão expirou. Entre de novo para enviar o pedido.');
        return;
      }
      if (res.status === 409) {               // data ocupada enquanto a pessoa preenchia
        occupiedSet = expandOccupied(await fetchDatasOcupadas());
        resetSelection();
        mostrar(resp.mensagem || 'Essa data não está mais disponível. Escolha outra.', true);
        return;
      }
      if (!res.ok) throw new Error(resp.mensagem || 'Falha ao enviar a reserva');
    }

    mostrar('Pedido enviado! Vamos confirmar a disponibilidade da data e retornar pelo WhatsApp em até 24h.');
    form.reset();
    toggleDataFinal();
    whatsappInput.classList.remove('valid', 'invalid');
    whatsappError.classList.remove('show');
    setTimeout(() => { prefillReserva(); updatePreview(); }, 0);
  } catch (err) {
    mostrar(err.message && err.message !== 'Failed to fetch' && err.message !== 'Falha ao enviar a reserva'
      ? err.message
      : 'Não foi possível enviar sua reserva agora. Tente novamente em instantes ou fale pelo WhatsApp.', true);
  } finally {
    btn.disabled = false;
  }
});

// Preenche nome e WhatsApp da reserva com os dados da conta
function prefillReserva() {
  if (!currentUser) return;
  const nomeInput = document.getElementById('nome');
  if (!nomeInput.value) nomeInput.value = currentUser.nome;
  if (!whatsappInput.value && currentUser.telefone) {
    whatsappInput.value = maskPhone(currentUser.telefone);
    validatePhoneField();
  }
  updatePreview();
}

// Quando o login muda: preenche os dados e, se o login foi pedido
// no meio do envio, segue com o pedido.
document.addEventListener('radiance:auth', e => {
  prefillReserva();
  if (e.detail.continuar) form.requestSubmit();
});
if (currentUser) prefillReserva();
