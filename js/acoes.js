// Estado global da tela de Ações (Evento -> Tarefa por Leito)
let eventTypesData = [];
let tasksData = [];
let bedsData = [];
let associationsData = [];
let pendingApply = null; // { idEventType, idTask, bedIds, conflicts }

document.addEventListener('DOMContentLoaded', () => {
  loadAll();
});

// === CARREGAR TUDO (eventos, tarefas, leitos, associações já configuradas) ===
async function loadAll() {
  try {
    const response = await fetch('api/acoes.jsp');
    if (!response.ok) throw new Error('Falha ao carregar dados.');
    const data = await response.json();

    eventTypesData = data.eventTypes || [];
    tasksData = data.tasks || [];
    bedsData = data.beds || [];
    associationsData = data.associations || [];

    populateEventFilterDropdown();
    resetCombo('applyEventTypeCombo');
    resetCombo('applyTaskCombo');
    renderBedsHierarchy('applyBedsContainer', bedsData, []);
    collapseAllInContainer('applyBedsContainer'); // árvore de leitos começa toda recolhida por padrão
    renderAssociationsTable();
    onApplyFormChange();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function populateEventFilterDropdown() {
  const select = document.getElementById('gridEventFilter');
  let html = '<option value="">Todos os eventos</option>';
  eventTypesData.forEach(group => {
    group.items.forEach(item => {
      html += `<option value="${item.id}">${escapeHtml(item.label)}</option>`;
    });
  });
  select.innerHTML = html;
}

// === FORMULÁRIO: COMBOBOX "DIGITE PARA LOCALIZAR" (Tipo de Evento / Tarefa / Leito de Origem) ===
// Cada combo tem: um <input> de texto visível, um <input type="hidden"> com o id selecionado
// e um <div> de dropdown com os resultados. onChange roda sempre que o valor selecionado muda
// (inclusive quando é limpo ao digitar), para cada combo reagir do seu próprio jeito.
const comboConfigs = {
  applyEventTypeCombo: {
    inputId: 'applyEventTypeSearch',
    hiddenId: 'applyEventType',
    dropdownId: 'applyEventTypeDropdown',
    getGroups: () => eventTypesData,
    onChange: () => onApplyFormChange()
  },
  applyTaskCombo: {
    inputId: 'applyTaskSearch',
    hiddenId: 'applyTask',
    dropdownId: 'applyTaskDropdown',
    getGroups: () => [{ group: null, items: tasksData.map(t => ({ id: t.id, label: t.task })) }],
    onChange: () => onApplyFormChange()
  },
  copySourceBedCombo: {
    inputId: 'copySourceBedSearch',
    hiddenId: 'copySourceBed',
    dropdownId: 'copySourceBedDropdown',
    getGroups: () => flattenBedsForCombo(),
    onChange: () => onCopySourceBedChange()
  }
};

document.addEventListener('click', (e) => {
  Object.keys(comboConfigs).forEach(comboId => {
    const wrapper = document.getElementById(comboId);
    if (wrapper && !wrapper.contains(e.target)) closeCombo(comboId);
  });
});

function resetCombo(comboId) {
  const cfg = comboConfigs[comboId];
  document.getElementById(cfg.hiddenId).value = '';
  document.getElementById(cfg.inputId).value = '';
  closeCombo(comboId);
}

// Converte a hierarquia de leitos (Ala > Andar > Quarto > Leito) em grupos planos para o combobox,
// usando "Ala / Andar / Quarto" como rótulo do grupo. O Quarto é repetido no rótulo de cada item
// (ex: "1407 — Leito 8") porque é a informação mais importante para localizar o leito — deve
// permanecer visível mesmo depois de selecionado, e não só durante a busca.
function flattenBedsForCombo() {
  const groups = [];
  bedsData.forEach(ala => {
    ala.subgroups.forEach(andar => {
      andar.subgroups.forEach(quarto => {
        if (quarto.items.length === 0) return;
        groups.push({
          group: `${ala.group} / ${andar.group} / ${quarto.group}`,
          items: quarto.items.map(item => ({ id: item.id, label: `${quarto.group} — ${item.label}` }))
        });
      });
    });
  });
  return groups;
}

// Digitar sempre limpa a seleção anterior — só conta como selecionado de novo ao clicar em um item da lista.
function onComboInput(comboId, query) {
  const cfg = comboConfigs[comboId];
  document.getElementById(cfg.hiddenId).value = '';
  renderComboDropdown(comboId, query);
  document.getElementById(cfg.dropdownId).classList.add('open');
  cfg.onChange();
}

function renderComboDropdown(comboId, query) {
  const cfg = comboConfigs[comboId];
  const q = (query || '').toLowerCase().trim();
  const dropdown = document.getElementById(cfg.dropdownId);

  let html = '';
  cfg.getGroups().forEach(g => {
    // Se o texto digitado combina com o rótulo do grupo (ex: "CC / 14 Andar / 1407" no combo de
    // leito de origem), mostra todos os itens do grupo. Senão, filtra item por item (ex: nome do leito).
    const groupMatches = !!(g.group && g.group.toLowerCase().includes(q));
    const items = groupMatches ? g.items : g.items.filter(i => i.label.toLowerCase().includes(q));
    if (items.length === 0) return;
    if (g.group) html += `<div class="combo-group-label">${escapeHtml(g.group)}</div>`;
    items.forEach(i => {
      html += `<div class="combo-option" data-id="${i.id}" data-label="${escapeHtmlForAttr(i.label)}" onclick="selectComboOption('${comboId}', this)">${escapeHtml(i.label)}</div>`;
    });
  });

  dropdown.innerHTML = html || '<div class="combo-empty">Nenhum resultado encontrado.</div>';
}

function selectComboOption(comboId, optionEl) {
  const cfg = comboConfigs[comboId];
  document.getElementById(cfg.hiddenId).value = optionEl.dataset.id;
  document.getElementById(cfg.inputId).value = optionEl.dataset.label;
  closeCombo(comboId);
  cfg.onChange();
}

function closeCombo(comboId) {
  document.getElementById(comboConfigs[comboId].dropdownId).classList.remove('open');
}

function findEventTypeById(id) {
  for (const group of eventTypesData) {
    const found = group.items.find(i => i.id === id);
    if (found) return found;
  }
  return null;
}

function findTaskById(id) {
  return tasksData.find(t => t.id === id) || null;
}

// === MODAL: APLICAR EVENTO A LEITOS ===
function openApplyModal() {
  document.getElementById('applyModal').classList.add('active');
}

function closeApplyModal() {
  document.getElementById('applyModal').classList.remove('active');
}

// === HABILITAÇÃO DO BOTÃO "APLICAR" ===
// Usa optional chaining no contador porque o span "applySelectedCount" vive dentro do próprio
// btnApply e é temporariamente substituído pelo spinner "Verificando..." durante startApply().
function onApplyFormChange() {
  const idEventType = document.getElementById('applyEventType').value;
  const idTask = document.getElementById('applyTask').value;
  const count = getCheckedIds('applyBedsContainer').length;

  const countEl = document.getElementById('applySelectedCount');
  if (countEl) countEl.textContent = count;
  document.getElementById('btnApply').disabled = !(idEventType && idTask && count > 0);
}

// === INICIAR APLICAÇÃO: VERIFICA CONFLITOS ANTES DE GRAVAR ===
async function startApply() {
  const idEventType = parseInt(document.getElementById('applyEventType').value, 10);
  const idTask = parseInt(document.getElementById('applyTask').value, 10);
  const bedIds = getCheckedIds('applyBedsContainer');
  if (!idEventType || !idTask || bedIds.length === 0) return;

  const btnApply = document.getElementById('btnApply');
  btnApply.disabled = true;
  btnApply.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';

  try {
    const response = await fetch('api/acoes.jsp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'preview', idEventType, idTask, bedIds })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Erro ao verificar conflitos.');

    if (!result.conflicts || result.conflicts.length === 0) {
      await doApply(idEventType, idTask, bedIds, []);
    } else {
      pendingApply = { idEventType, idTask, bedIds, conflicts: result.conflicts };
      renderConflictModal();
      document.getElementById('conflictModal').classList.add('active');
    }
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    // Restaura o HTML do botão (com o span do contador) ANTES de chamar onApplyFormChange(),
    // já que o span vive dentro do próprio botão e foi destruído pelo innerHTML "Verificando...".
    btnApply.innerHTML = `<i class="fas fa-check" style="margin-right:6px"></i> Aplicar (<span id="applySelectedCount">${bedIds.length}</span> leitos selecionados)`;
    onApplyFormChange();
  }
}

// === MODAL DE CONFLITO ===
function renderConflictModal() {
  const task = findTaskById(pendingApply.idTask);
  const newTaskLabel = task ? task.task : '';

  document.getElementById('conflictTableBody').innerHTML = pendingApply.conflicts.map(c => `
    <tr>
      <td><input type="checkbox" class="conflict-checkbox" data-bed="${c.idBed}"></td>
      <td>${escapeHtml(c.building)} / ${escapeHtml(c.wing)}</td>
      <td><strong>${escapeHtml(c.room)}</strong></td>
      <td>${escapeHtml(c.bed)}</td>
      <td>${escapeHtml(c.currentTask)}</td>
      <td>${escapeHtml(newTaskLabel)}</td>
    </tr>
  `).join('');
  document.getElementById('selectAllConflicts').checked = false;
}

function toggleAllConflicts(checkbox) {
  document.querySelectorAll('#conflictTableBody .conflict-checkbox').forEach(cb => { cb.checked = checkbox.checked; });
}

function closeConflictModal() {
  document.getElementById('conflictModal').classList.remove('active');
  pendingApply = null;
}

async function confirmApply() {
  if (!pendingApply) return;
  const overwriteBedIds = Array.from(document.querySelectorAll('#conflictTableBody .conflict-checkbox:checked'))
    .map(cb => parseInt(cb.dataset.bed, 10));

  const { idEventType, idTask, bedIds } = pendingApply;
  closeConflictModal();
  await doApply(idEventType, idTask, bedIds, overwriteBedIds);
}

// === GRAVAÇÃO EFETIVA (upsert restrito ao par leito+evento escolhido) ===
async function doApply(idEventType, idTask, bedIds, overwriteBedIds) {
  try {
    const response = await fetch('api/acoes.jsp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'apply', idEventType, idTask, bedIds, overwriteBedIds })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Erro ao aplicar.');

    showToast(result.message, 'success');

    // loadAll() limpa os combos do zero; guardamos o evento/tarefa escolhidos para restaurar a
    // seleção depois (facilita aplicar a mesma combinação a outro grupo de leitos em seguida).
    const keepEventType = idEventType;
    const keepTask = idTask;
    const keepEventLabel = findEventTypeById(keepEventType)?.label || '';
    const keepTaskLabel = findTaskById(keepTask)?.task || '';

    await loadAll();

    document.getElementById('applyEventType').value = keepEventType;
    document.getElementById('applyEventTypeSearch').value = keepEventLabel;
    document.getElementById('applyTask').value = keepTask;
    document.getElementById('applyTaskSearch').value = keepTaskLabel;
    // A árvore de leitos é sempre recriada limpa (sem seleção) pelo loadAll(), o que é o comportamento desejado aqui.
    onApplyFormChange();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// === GRADE DE GESTÃO: ASSOCIAÇÕES JÁ CONFIGURADAS, AGRUPADAS POR LEITO ===
let currentModalBedId = null;

// Agrupa associationsData (uma linha por leito+evento) em uma linha por leito, preservando
// a ordem (building/wing/room/bed) que já vem ordenada do backend.
function groupAssociationsByBed() {
  const groups = new Map();
  associationsData.forEach(a => {
    if (!groups.has(a.idBed)) {
      groups.set(a.idBed, { idBed: a.idBed, bed: a.bed, room: a.room, wing: a.wing, building: a.building, items: [] });
    }
    groups.get(a.idBed).items.push(a);
  });
  return Array.from(groups.values());
}

function renderAssociationsTable() {
  const tableBody = document.getElementById('assocTableBody');
  const countBadge = document.getElementById('countBadge');
  const q = (document.getElementById('gridSearchInput').value || '').toLowerCase().trim();
  const eventFilter = document.getElementById('gridEventFilter').value;

  const groups = groupAssociationsByBed();

  let filtered = groups.filter(g => {
    if (eventFilter && !g.items.some(i => String(i.idEventType) === eventFilter)) return false;
    if (!q) return true;
    return (g.bed && g.bed.toLowerCase().includes(q)) ||
           (g.room && g.room.toLowerCase().includes(q)) ||
           (g.wing && g.wing.toLowerCase().includes(q)) ||
           (g.building && g.building.toLowerCase().includes(q)) ||
           g.items.some(i => (i.eventType && i.eventType.toLowerCase().includes(q)) || (i.task && i.task.toLowerCase().includes(q)));
  });

  countBadge.textContent = filtered.length;

  if (filtered.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-muted)">Nenhum leito com associações encontrado.</td></tr>`;
    return;
  }

  tableBody.innerHTML = filtered.map(g => `
    <tr onclick="openBedAssocModal(${g.idBed})" style="cursor:pointer;">
      <td>${escapeHtml(g.building)} / ${escapeHtml(g.wing)}</td>
      <td><strong>${escapeHtml(g.room)}</strong></td>
      <td>${escapeHtml(g.bed)}</td>
      <td style="text-align:center;"><span class="badge">${g.items.length}</span></td>
      <td>
        <div class="event-badge-list">
          ${g.items.map(i => `<span class="event-badge" style="color:${escapeHtmlForAttr(i.color || '#333')};background:${escapeHtmlForAttr(i.background || '#eee')};">${escapeHtml(i.eventType)}</span>`).join('')}
        </div>
      </td>
    </tr>
  `).join('');
}

// === MODAL DE DETALHES DO LEITO ===
// idEventType dos eventos marcados para remoção na sessão atual do modal (só efetivados ao Salvar).
let bedModalPendingDeletes = new Set();

function openBedAssocModal(idBed) {
  currentModalBedId = idBed;
  bedModalPendingDeletes.clear();
  document.getElementById('bedModalSearchInput').value = '';
  if (!renderBedModalBody(idBed)) return; // leito sem associações (não deveria ocorrer a partir da grade)
  document.getElementById('bedAssocModal').classList.add('active');
}

function closeBedAssocModal() {
  document.getElementById('bedAssocModal').classList.remove('active');
  currentModalBedId = null;
  bedModalPendingDeletes.clear();
}

// Renderiza (ou re-renderiza, após salvar) o conteúdo do modal de um leito.
// Cada <select> de tarefa guarda em data-original o valor hoje persistido no banco, usado por
// cancelBedModalChanges() para desfazer trocas ainda não salvas.
// Retorna false e fecha o modal se o leito não tiver mais nenhuma associação.
function renderBedModalBody(idBed) {
  const items = associationsData.filter(a => a.idBed === idBed);
  if (items.length === 0) {
    closeBedAssocModal();
    return false;
  }

  const meta = items[0];
  document.getElementById('bedAssocModalTitle').textContent =
    `Quarto ${meta.room} — Leito ${meta.bed} (${meta.building} / ${meta.wing})`;

  document.getElementById('bedAssocModalBody').innerHTML = items.map(a => `
    <tr data-event-row="${a.idEventType}" data-search="${escapeHtmlForAttr((a.eventType + ' ' + a.task).toLowerCase())}">
      <td><span class="event-badge" style="color:${escapeHtmlForAttr(a.color || '#333')};background:${escapeHtmlForAttr(a.background || '#eee')};">${escapeHtml(a.eventType)}</span></td>
      <td>
        <select class="inline-task-select modal-task-select" data-bed="${a.idBed}" data-event="${a.idEventType}" data-original="${a.idTask}">
          ${tasksData.map(t => `<option value="${t.id}" ${t.id === a.idTask ? 'selected' : ''}>${escapeHtml(t.task)}</option>`).join('')}
        </select>
      </td>
      <td style="text-align:center;">
        <button class="btn-icon delete" onclick="toggleDeleteAssociationRow(${a.idEventType})" title="Marcar para remover">
          <i class="fas fa-trash-alt"></i>
        </button>
      </td>
    </tr>
  `).join('');
  filterBedModalRows(document.getElementById('bedModalSearchInput').value);
  return true;
}

// Filtra as linhas do modal de leito por nome de evento ou de tarefa (persistida).
function filterBedModalRows(query) {
  const q = (query || '').toLowerCase().trim();
  document.querySelectorAll('#bedAssocModalBody tr').forEach(row => {
    row.style.display = (row.dataset.search || '').includes(q) ? '' : 'none';
  });
}

// Marca/desmarca um evento para remoção. Não chama a API — a remoção só é efetivada em saveBedModalChanges().
function toggleDeleteAssociationRow(idEventType) {
  const row = document.querySelector(`#bedAssocModalBody tr[data-event-row="${idEventType}"]`);
  if (!row) return;
  const select = row.querySelector('.modal-task-select');
  const btn = row.querySelector('.btn-icon.delete');
  const marked = bedModalPendingDeletes.has(idEventType);

  if (marked) {
    bedModalPendingDeletes.delete(idEventType);
    row.classList.remove('pending-delete');
    select.disabled = false;
    btn.innerHTML = '<i class="fas fa-trash-alt"></i>';
    btn.title = 'Marcar para remover';
  } else {
    bedModalPendingDeletes.add(idEventType);
    row.classList.add('pending-delete');
    select.disabled = true;
    btn.innerHTML = '<i class="fas fa-undo"></i>';
    btn.title = 'Desfazer remoção';
  }
}

// Desfaz, sem fechar o modal, qualquer troca de tarefa ou marcação de remoção ainda não salva.
function cancelBedModalChanges() {
  document.querySelectorAll('#bedAssocModalBody .modal-task-select').forEach(sel => {
    sel.value = sel.dataset.original;
    sel.disabled = false;
  });
  document.querySelectorAll('#bedAssocModalBody tr.pending-delete').forEach(row => {
    row.classList.remove('pending-delete');
    const btn = row.querySelector('.btn-icon.delete');
    if (btn) {
      btn.innerHTML = '<i class="fas fa-trash-alt"></i>';
      btn.title = 'Marcar para remover';
    }
  });
  bedModalPendingDeletes.clear();
}

// Grava no banco as remoções marcadas e as tarefas efetivamente alteradas (comparado ao data-original).
async function saveBedModalChanges() {
  const idBed = currentModalBedId;
  const toDelete = Array.from(bedModalPendingDeletes);
  const toUpdate = Array.from(document.querySelectorAll('#bedAssocModalBody .modal-task-select'))
    .filter(sel => !bedModalPendingDeletes.has(parseInt(sel.dataset.event, 10)) && sel.value !== sel.dataset.original);

  if (toDelete.length === 0 && toUpdate.length === 0) {
    closeBedAssocModal();
    return;
  }

  const btnSave = document.getElementById('btnSaveBedModal');
  btnSave.disabled = true;
  btnSave.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

  try {
    for (const idEventType of toDelete) {
      const response = await fetch('api/acoes.jsp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_association', idBed, idEventType })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erro ao remover associação.');
      associationsData = associationsData.filter(a => !(a.idBed === idBed && a.idEventType === idEventType));
    }

    for (const sel of toUpdate) {
      const idEventType = parseInt(sel.dataset.event, 10);
      const idTask = parseInt(sel.value, 10);

      const response = await fetch('api/acoes.jsp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_association', idBed, idEventType, idTask })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erro ao salvar associação.');

      const row = associationsData.find(a => a.idBed === idBed && a.idEventType === idEventType);
      if (row) {
        const task = findTaskById(idTask);
        row.idTask = idTask;
        row.task = task ? task.task : row.task;
      }
    }

    bedModalPendingDeletes.clear();
    renderAssociationsTable();

    const parts = [];
    if (toUpdate.length) parts.push(`${toUpdate.length} tarefa(s) atualizada(s)`);
    if (toDelete.length) parts.push(`${toDelete.length} evento(s) removido(s)`);
    showToast(parts.join(' e ') + ' com sucesso!', 'success');

    renderBedModalBody(idBed); // fecha o modal automaticamente se não restou nenhuma associação, senão atualiza a lista
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    btnSave.disabled = false;
    btnSave.innerHTML = '<i class="fas fa-save" style="margin-right:6px"></i> Salvar';
  }
}

// === MODAL: COPIAR CONFIGURAÇÕES DE UM LEITO PARA OUTROS ===
// pendingCopyApply guarda o estado entre startCopyApply() (calcula conflitos) e confirmCopyApply()
// (efetiva, após o usuário decidir quais conflitos sobrescrever).
let pendingCopyApply = null;

function openCopyBedModal() {
  resetCombo('copySourceBedCombo');
  document.getElementById('copySourceEventsSection').style.display = 'none';
  document.getElementById('copySourceEventsContainer').innerHTML = '';
  renderBedsHierarchy('copyDestBedsContainer', bedsData, []);
  collapseAllInContainer('copyDestBedsContainer');
  onCopyFormChange();
  document.getElementById('copyBedModal').classList.add('active');
}

function closeCopyBedModal() {
  document.getElementById('copyBedModal').classList.remove('active');
}

// Disparado pelo combo de Leito de Origem: carrega os eventos hoje configurados nesse leito
// (lista local, vinda de associationsData já carregado) e impede selecioná-lo como destino.
function onCopySourceBedChange() {
  const idBed = parseInt(document.getElementById('copySourceBed').value, 10) || null;
  const section = document.getElementById('copySourceEventsSection');
  const container = document.getElementById('copySourceEventsContainer');

  if (!idBed) {
    section.style.display = 'none';
    container.innerHTML = '';
    markSourceBedInDestTree(null);
    onCopyFormChange();
    return;
  }

  const items = associationsData.filter(a => a.idBed === idBed);
  container.innerHTML = items.length === 0
    ? '<div class="checklist-empty">Este leito não tem eventos configurados.</div>'
    : items.map(a => `
        <div class="checklist-item">
          <label>
            <input type="checkbox" class="copy-event-checkbox" value="${a.idEventType}" data-task="${a.idTask}" checked onchange="onCopyFormChange()">
            <span class="event-badge" style="color:${escapeHtmlForAttr(a.color || '#333')};background:${escapeHtmlForAttr(a.background || '#eee')};">${escapeHtml(a.eventType)}</span>
            <span>&rarr; ${escapeHtml(a.task)}</span>
          </label>
        </div>
      `).join('');
  section.style.display = '';
  markSourceBedInDestTree(idBed);
  onCopyFormChange();
}

// O leito de origem não pode ser escolhido como destino — ele fica desmarcado e desabilitado na árvore.
function markSourceBedInDestTree(idBed) {
  document.querySelectorAll('#copyDestBedsContainer .checklist-item input[type="checkbox"]').forEach(cb => {
    const isSource = idBed !== null && parseInt(cb.value, 10) === idBed;
    cb.disabled = isSource;
    if (isSource) cb.checked = false;
    cb.closest('.checklist-item').classList.toggle('is-source-bed', isSource);
  });
}

function onCopyFormChange() {
  const idBed = document.getElementById('copySourceBed').value;
  const eventsChecked = document.querySelectorAll('#copySourceEventsContainer .copy-event-checkbox:checked').length;
  const bedsChecked = getCheckedIds('copyDestBedsContainer').length;

  const evCountEl = document.getElementById('copyEventsSelectedCount');
  const bedCountEl = document.getElementById('copySelectedCount');
  if (evCountEl) evCountEl.textContent = eventsChecked;
  if (bedCountEl) bedCountEl.textContent = bedsChecked;

  document.getElementById('btnCopyApply').disabled = !(idBed && eventsChecked > 0 && bedsChecked > 0);
}

// Calcula os conflitos inteiramente no cliente (associationsData já reflete o estado atual de
// todos os leitos), evitando uma chamada extra ao servidor só para isso.
async function startCopyApply() {
  const sourceBedId = parseInt(document.getElementById('copySourceBed').value, 10);
  const selectedEvents = Array.from(document.querySelectorAll('#copySourceEventsContainer .copy-event-checkbox:checked'))
    .map(cb => ({ idEventType: parseInt(cb.value, 10), idTask: parseInt(cb.dataset.task, 10) }));
  const destBedIds = getCheckedIds('copyDestBedsContainer').filter(idBed => idBed !== sourceBedId);
  if (!sourceBedId || selectedEvents.length === 0 || destBedIds.length === 0) return;

  const conflicts = [];
  selectedEvents.forEach(ev => {
    destBedIds.forEach(idBed => {
      const existing = associationsData.find(a => a.idBed === idBed && a.idEventType === ev.idEventType);
      if (existing && existing.idTask !== ev.idTask) {
        conflicts.push({
          idBed, bed: existing.bed, room: existing.room, wing: existing.wing, building: existing.building,
          idEventType: ev.idEventType, eventType: existing.eventType, color: existing.color, background: existing.background,
          currentTask: existing.task, newTask: findTaskById(ev.idTask)?.task || ''
        });
      }
    });
  });

  if (conflicts.length === 0) {
    await doCopyApply(selectedEvents, destBedIds, new Set());
  } else {
    pendingCopyApply = { selectedEvents, destBedIds, conflicts };
    renderCopyConflictModal();
    document.getElementById('copyConflictModal').classList.add('active');
  }
}

function renderCopyConflictModal() {
  document.getElementById('copyConflictTableBody').innerHTML = pendingCopyApply.conflicts.map(c => `
    <tr>
      <td><input type="checkbox" class="copy-conflict-checkbox" data-bed="${c.idBed}" data-event="${c.idEventType}"></td>
      <td><span class="event-badge" style="color:${escapeHtmlForAttr(c.color || '#333')};background:${escapeHtmlForAttr(c.background || '#eee')};">${escapeHtml(c.eventType)}</span></td>
      <td>${escapeHtml(c.building)} / ${escapeHtml(c.wing)}</td>
      <td><strong>${escapeHtml(c.room)}</strong></td>
      <td>${escapeHtml(c.bed)}</td>
      <td>${escapeHtml(c.currentTask)}</td>
      <td>${escapeHtml(c.newTask)}</td>
    </tr>
  `).join('');
  document.getElementById('selectAllCopyConflicts').checked = false;
}

function toggleAllCopyConflicts(checkbox) {
  document.querySelectorAll('#copyConflictTableBody .copy-conflict-checkbox').forEach(cb => { cb.checked = checkbox.checked; });
}

function closeCopyConflictModal() {
  document.getElementById('copyConflictModal').classList.remove('active');
  pendingCopyApply = null;
}

async function confirmCopyApply() {
  if (!pendingCopyApply) return;
  const overwriteKeys = new Set(Array.from(document.querySelectorAll('#copyConflictTableBody .copy-conflict-checkbox:checked'))
    .map(cb => `${cb.dataset.bed}:${cb.dataset.event}`));

  const { selectedEvents, destBedIds } = pendingCopyApply;
  closeCopyConflictModal();
  await doCopyApply(selectedEvents, destBedIds, overwriteKeys);
}

// Reaproveita a própria action "apply" da API (a mesma do formulário "Aplicar Evento a Leitos"),
// uma chamada por evento selecionado — cada uma já faz o upsert restrito ao par leito+evento.
async function doCopyApply(selectedEvents, destBedIds, overwriteKeys) {
  const btn = document.getElementById('btnCopyApply');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Copiando...';

  let totalCreated = 0, totalUpdated = 0, totalSkipped = 0;
  try {
    for (const ev of selectedEvents) {
      const overwriteBedIds = destBedIds.filter(idBed => overwriteKeys.has(`${idBed}:${ev.idEventType}`));

      const response = await fetch('api/acoes.jsp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'apply', idEventType: ev.idEventType, idTask: ev.idTask, bedIds: destBedIds, overwriteBedIds })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erro ao copiar configuração.');

      totalCreated += result.created;
      totalUpdated += result.updated;
      totalSkipped += result.skipped;
    }

    showToast(`Cópia concluída: ${totalCreated} criada(s), ${totalUpdated} atualizada(s)` +
      (totalSkipped > 0 ? `, ${totalSkipped} ignorada(s) por conflito não confirmado.` : '.'), 'success');

    closeCopyBedModal();
    await loadAll();
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-copy" style="margin-right:6px"></i> Copiar (<span id="copySelectedCount">0</span> leitos selecionados)';
  }
}

// === ÁRVORE DE LEITOS (Ala > Andar > Quarto), reaproveitando o mesmo padrão visual de usuarios.js ===
function renderBedsHierarchy(containerId, hierarchy, selectedIds) {
  const container = document.getElementById(containerId);
  if (!hierarchy || hierarchy.length === 0) {
    container.innerHTML = '<div class="checklist-empty">Nenhum leito cadastrado.</div>';
    return;
  }
  const selected = new Set((selectedIds || []).map(Number));

  container.innerHTML = hierarchy.map(ala => `
    <div class="checklist-group ala-group">
      <div class="checklist-group-title ala-title">
        <span class="group-title-label" onclick="toggleBedGroupCollapse(this)">
          <i class="fas fa-chevron-down collapse-icon"></i>
          <i class="fas fa-building" style="margin-right:6px;color:var(--primary);"></i>${escapeHtml(ala.group)}
        </span>
        <div class="group-actions" onclick="event.stopPropagation()">
          <label class="group-select-all">
            <input type="checkbox" onchange="toggleGroupCheckboxes(this)"> Todos
          </label>
        </div>
      </div>
      <div class="checklist-subgroups">
        ${ala.subgroups.map(andar => `
          <div class="checklist-group andar-group">
            <div class="checklist-group-title andar-title">
              <span class="group-title-label" onclick="toggleBedGroupCollapse(this)">
                <i class="fas fa-chevron-down collapse-icon"></i>
                <i class="fas fa-map-marker-alt" style="margin-right:6px;color:var(--primary);"></i>${escapeHtml(andar.group)}
              </span>
              <div class="group-actions" onclick="event.stopPropagation()">
                <label class="group-select-all">
                  <input type="checkbox" onchange="toggleGroupCheckboxes(this)"> Todos
                </label>
              </div>
            </div>
            <div class="checklist-subgroups">
              ${andar.subgroups.map(quarto => `
                <div class="checklist-group quarto-group">
                  <div class="checklist-group-title quarto-title">
                    <span class="group-title-label" onclick="toggleBedGroupCollapse(this)">
                      <i class="fas fa-chevron-down collapse-icon"></i>
                      <i class="fas fa-desktop" style="margin-right:6px;color:var(--primary);"></i>${escapeHtml(quarto.group)}
                    </span>
                    <label class="group-select-all" onclick="event.stopPropagation()">
                      <input type="checkbox" onchange="toggleGroupCheckboxes(this)"> Todos
                    </label>
                  </div>
                  <div class="checklist-items">
                    ${quarto.items.map(item => `
                      <div class="checklist-item" data-label="${escapeHtmlForAttr([ala.group, andar.group, quarto.group, item.label].join(' ').toLowerCase())}">
                        <label>
                          <input type="checkbox" value="${item.id}" ${selected.has(item.id) ? 'checked' : ''}>
                          <i class="fas fa-bed" style="margin-right:4px;color:var(--primary);"></i>
                          <span>${escapeHtml(item.label)}</span>
                        </label>
                      </div>
                    `).join('')}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function toggleGroupCheckboxes(selectAllCheckbox) {
  const checked = selectAllCheckbox.checked;
  const group = selectAllCheckbox.closest('.checklist-group');
  group.querySelectorAll('.checklist-items input[type="checkbox"]').forEach(cb => { cb.checked = checked; });
  // O próprio "change" deste checkbox borbulha até o container (#applyBedsContainer ou
  // #copyDestBedsContainer), cujo onchange já dispara a função de atualização correta.
}

function setBedGroupCollapsed(groupEl, collapsed) {
  groupEl.classList.toggle('collapsed', collapsed);
  groupEl.querySelectorAll('.checklist-group').forEach(g => g.classList.toggle('collapsed', collapsed));
}

function toggleBedGroupCollapse(titleEl) {
  const group = titleEl.closest('.checklist-group');
  setBedGroupCollapsed(group, !group.classList.contains('collapsed'));
}

function expandAllInContainer(containerId) {
  document.querySelectorAll(`#${containerId} .checklist-group`).forEach(g => g.classList.remove('collapsed'));
}

function collapseAllInContainer(containerId) {
  document.querySelectorAll(`#${containerId} .checklist-group`).forEach(g => g.classList.add('collapsed'));
}

function filterChecklist(containerId, query) {
  const q = (query || '').toLowerCase().trim();
  const container = document.getElementById(containerId);
  container.querySelectorAll('.checklist-item').forEach(item => {
    item.style.display = item.dataset.label.includes(q) ? '' : 'none';
  });
  container.querySelectorAll('.checklist-group').forEach(group => {
    const hasVisible = Array.from(group.querySelectorAll('.checklist-item')).some(i => i.style.display !== 'none');
    group.style.display = hasVisible ? '' : 'none';
    // Com busca ativa, expande automaticamente os grupos que contêm algum resultado — caso contrário,
    // o item filtrado fica escondido pelo CSS de grupo recolhido (a árvore começa toda recolhida por padrão).
    if (q && hasVisible) group.classList.remove('collapsed');
  });
}

function getCheckedIds(containerId) {
  const container = document.getElementById(containerId);
  return Array.from(container.querySelectorAll('.checklist-items input[type="checkbox"]:checked')).map(cb => parseInt(cb.value, 10));
}

// === TOAST ===
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
  toast.innerHTML = `<i class="fas ${icon}"></i><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 200);
  }, 4000);
}

// === LOGOUT ===
async function logout() {
  try {
    await fetch('api/logout.jsp');
    window.location.replace('login.html');
  } catch (error) {
    window.location.replace('login.html');
  }
}

// === HELPERS ===
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeHtmlForAttr(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/'/g, "\\'");
}
