// Estado global da tela de Administração de Usuários
let usersList = [];
let lookups = null;
let currentEditId = null;
let templateSourceUser = null;
let selectedTemplateTargetIds = new Set();
let currentPreferencesObj = {};
let preferencesTouched = false;

document.addEventListener('DOMContentLoaded', async () => {
  await loadLookups();
  await loadUsers();

  // Atualiza os contadores das guias sempre que algum checkbox (item ou "selecionar todos") é alterado.
  document.getElementById('userForm').addEventListener('change', (e) => {
    if (e.target.matches('input[type="checkbox"]')) {
      updateTabCounts();
    }
  });
});

// === CARREGAR LOOKUPS (direitos, leitos, eventos, grupos, alarmes) ===
async function loadLookups() {
  try {
    const response = await fetch('api/user_lookups.jsp');
    if (!response.ok) throw new Error('Falha ao carregar dados de apoio.');
    lookups = await response.json();

    const rightsSelect = document.getElementById('userRights');
    rightsSelect.innerHTML = lookups.rights.map(r =>
      `<option value="${r.id}">${escapeHtml(r.name)}</option>`
    ).join('');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// === CARREGAR USUÁRIOS ===
async function loadUsers() {
  const tableBody = document.getElementById('tableBody');
  try {
    const response = await fetch('api/users.jsp');
    if (!response.ok) throw new Error('Falha ao carregar usuários do banco de dados.');
    usersList = await response.json();
    if (!Array.isArray(usersList)) usersList = [];
    renderUsersTable();
  } catch (error) {
    showToast(error.message, 'error');
    tableBody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center;padding:40px;color:var(--danger)">
          <i class="fas fa-exclamation-triangle" style="margin-right:6px"></i> Erro ao carregar dados.
        </td>
      </tr>
    `;
  }
}

// === RENDERIZAR TABELA ===
function renderUsersTable() {
  const tableBody = document.getElementById('tableBody');
  const countBadge = document.getElementById('countBadge');
  const q = (document.getElementById('searchInput').value || '').toLowerCase().trim();

  const filtered = usersList.filter(u =>
    (u.name && u.name.toLowerCase().includes(q)) ||
    (u.login && u.login.toLowerCase().includes(q))
  );

  countBadge.textContent = filtered.length;

  if (filtered.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center;padding:40px;color:var(--text-muted)">
          Nenhum usuário encontrado.
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = filtered.map(u => `
    <tr onclick="openEditModal(${u.id})" style="cursor:pointer;">
      <td><strong>${escapeHtml(u.name)}</strong></td>
      <td>${escapeHtml(u.login)}</td>
      <td><span class="badge">${escapeHtml(u.userRights)}</span></td>
      <td>${countChip('fa-bed', 'Leitos', u.bedsCount)}${countChip('fa-bell', 'Eventos', u.eventTypesCount)}${countChip('fa-user-friends', 'Grupos', u.staffGroupsCount)}${countChip('fa-exclamation-circle', 'Alarmes', u.alarmTypesCount)}</td>
      <td style="text-align:center;" onclick="event.stopPropagation()">
        <button class="btn-icon" onclick="openEditModal(${u.id})" title="Editar"><i class="fas fa-edit"></i></button>
        <button class="btn-icon template" onclick="openTemplateModal(${u.id})" title="Usar como Modelo" style="margin-left:6px;"><i class="fas fa-clone"></i></button>
        <button class="btn-icon delete" onclick="deleteUser(${u.id})" title="Excluir" style="margin-left:6px;"><i class="fas fa-trash-alt"></i></button>
      </td>
    </tr>
  `).join('');
}

function countChip(icon, label, count) {
  const cls = count > 0 ? 'count-chip' : 'count-chip empty';
  return `<span class="${cls}" title="${label}"><i class="fas ${icon}"></i>${count}</span>`;
}

// === TABS DO MODAL DE USUÁRIO ===
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach(content => content.classList.toggle('active', content.dataset.tabContent === tab));
}

// === RENDERIZAÇÃO DE LISTAS DE SELEÇÃO (leitos / eventos / grupos) ===
function renderGroupedChecklist(containerId, groups, selectedIds, withSelectAll) {
  const container = document.getElementById(containerId);
  if (!groups || groups.length === 0) {
    container.innerHTML = '<div class="checklist-empty">Nenhum registro cadastrado.</div>';
    return;
  }
  const selected = new Set((selectedIds || []).map(Number));

  container.innerHTML = groups.map(g => `
    <div class="checklist-group">
      <div class="checklist-group-title" style="display:flex; justify-content:space-between; align-items:center;">
        <span>${escapeHtml(g.group)}</span>
        ${withSelectAll ? `
          <label class="group-select-all">
            <input type="checkbox" onchange="toggleGroupCheckboxes(this)"> Selecionar todos
          </label>
        ` : ''}
      </div>
      <div class="checklist-items">
        ${g.items.map(item => `
          <div class="checklist-item" data-label="${escapeHtmlForAttr((item.label || '').toLowerCase())}">
            <label>
              <input type="checkbox" value="${item.id}" ${selected.has(item.id) ? 'checked' : ''}>
              <span>${escapeHtml(item.label)}</span>
            </label>
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
}

// "Selecionar todos" geral: afeta todas as categorias/grupos de um container de uma vez (ex: Tipos de Evento).
function toggleAllInContainer(containerId, selectAllCheckbox) {
  const checked = selectAllCheckbox.checked;
  document.getElementById(containerId).querySelectorAll('.checklist-items input[type="checkbox"]').forEach(cb => { cb.checked = checked; });
}

// === RENDERIZAÇÃO HIERÁRQUICA DE LEITOS (Ala > Andar > Quarto) ===
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
          <i class="fas fa-building" style="margin-right:6px"></i>${escapeHtml(ala.group)}
        </span>
        <div class="group-actions" onclick="event.stopPropagation()">
          <button type="button" class="icon-btn-xs" title="Expandir Tudo" onclick="expandBedSubtree(this)"><i class="fas fa-expand-alt"></i></button>
          <button type="button" class="icon-btn-xs" title="Recolher Tudo" onclick="collapseBedSubtree(this)"><i class="fas fa-compress-alt"></i></button>
          <label class="group-select-all">
            <input type="checkbox" onchange="toggleGroupCheckboxes(this)"> Selecionar todos
          </label>
        </div>
      </div>
      <div class="checklist-subgroups">
        ${ala.subgroups.map(andar => `
          <div class="checklist-group andar-group">
            <div class="checklist-group-title andar-title">
              <span class="group-title-label" onclick="toggleBedGroupCollapse(this)">
                <i class="fas fa-chevron-down collapse-icon"></i>
                <i class="fas fa-layer-group" style="margin-right:6px"></i>${escapeHtml(andar.group)}
              </span>
              <div class="group-actions" onclick="event.stopPropagation()">
                <button type="button" class="icon-btn-xs" title="Expandir Tudo" onclick="expandBedSubtree(this)"><i class="fas fa-expand-alt"></i></button>
                <button type="button" class="icon-btn-xs" title="Recolher Tudo" onclick="collapseBedSubtree(this)"><i class="fas fa-compress-alt"></i></button>
                <label class="group-select-all">
                  <input type="checkbox" onchange="toggleGroupCheckboxes(this)"> Selecionar todos
                </label>
              </div>
            </div>
            <div class="checklist-subgroups">
              ${andar.subgroups.map(quarto => `
                <div class="checklist-group quarto-group">
                  <div class="checklist-group-title quarto-title">
                    <span class="group-title-label" onclick="toggleBedGroupCollapse(this)">
                      <i class="fas fa-chevron-down collapse-icon"></i>
                      <i class="fas fa-door-open" style="margin-right:6px"></i>${escapeHtml(quarto.group)}
                    </span>
                    <label class="group-select-all" onclick="event.stopPropagation()">
                      <input type="checkbox" onchange="toggleGroupCheckboxes(this)"> Selecionar todos
                    </label>
                  </div>
                  <div class="checklist-items">
                    ${quarto.items.map(item => `
                      <div class="checklist-item" data-label="${escapeHtmlForAttr((item.label || '').toLowerCase())}">
                        <label>
                          <input type="checkbox" value="${item.id}" ${selected.has(item.id) ? 'checked' : ''}>
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

// Aplica o estado (recolhido/expandido) a um grupo e a toda a sua sub-árvore (Ala > Andar > Quarto).
function setBedGroupCollapsed(groupEl, collapsed) {
  groupEl.classList.toggle('collapsed', collapsed);
  groupEl.querySelectorAll('.checklist-group').forEach(g => g.classList.toggle('collapsed', collapsed));
}

function toggleBedGroupCollapse(titleEl) {
  const group = titleEl.closest('.checklist-group');
  setBedGroupCollapsed(group, !group.classList.contains('collapsed'));
}

function expandAllBeds() {
  document.querySelectorAll('#bedsContainer .checklist-group').forEach(g => g.classList.remove('collapsed'));
}

function collapseAllBeds() {
  document.querySelectorAll('#bedsContainer .checklist-group').forEach(g => g.classList.add('collapsed'));
}

// Expandir/Recolher Tudo restrito a uma Ala ou Andar específico (não afeta os demais).
function expandBedSubtree(btnEl) {
  setBedGroupCollapsed(btnEl.closest('.checklist-group'), false);
}

function collapseBedSubtree(btnEl) {
  setBedGroupCollapsed(btnEl.closest('.checklist-group'), true);
}

function renderFlatChecklist(containerId, items, selectedIds) {
  const container = document.getElementById(containerId);
  if (!items || items.length === 0) {
    container.innerHTML = '<div class="checklist-empty">Nenhum registro cadastrado.</div>';
    return;
  }
  const selected = new Set((selectedIds || []).map(Number));

  container.innerHTML = `
    <div class="checklist-group">
      <div class="checklist-group-title" style="display:flex; justify-content:flex-end; border-bottom:none; padding-bottom:0;">
        <label class="group-select-all">
          <input type="checkbox" onchange="toggleGroupCheckboxes(this)"> Selecionar todos
        </label>
      </div>
      <div class="checklist-items">
        ${items.map(item => `
          <div class="checklist-item" data-label="${escapeHtmlForAttr((item.label || '').toLowerCase())}">
            <label>
              <input type="checkbox" value="${item.id}" ${selected.has(item.id) ? 'checked' : ''}>
              <span>${escapeHtml(item.label)}</span>
            </label>
          </div>
        `).join('')}
      </div>
    </div>
  `;
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
  });
}

function getCheckedIds(containerId) {
  const container = document.getElementById(containerId);
  return Array.from(container.querySelectorAll('.checklist-items input[type="checkbox"]:checked')).map(cb => parseInt(cb.value, 10));
}

// Mostra, ao lado do nome de cada guia, a quantidade de ítens selecionados nela.
function updateTabCounts() {
  document.getElementById('tabCount-leitos').textContent = getCheckedIds('bedsContainer').length;
  document.getElementById('tabCount-eventos').textContent = getCheckedIds('eventTypesContainer').length;
  document.getElementById('tabCount-grupos').textContent = getCheckedIds('staffGroupsContainer').length;
  document.getElementById('tabCount-alarmes').textContent = getCheckedIds('alarmTypesContainer').length;

  const transportGranted = ['finish_transport', 'cancel_transport', 'select_transport_agents']
    .filter(key => getTransportPermission(key)).length;
  document.getElementById('tabCount-prefs').textContent = transportGranted + '/3';
}

// === PERMISSÕES DE TRANSPORTE (campo preferences do Multitone) ===
// Mesmo campo `users.preferences` usado pelo diálogo "Permissões de transporte" do Multitone:
// JSON com { gridSettings, panelFilters, properties: { transport_permissions: { finish_transport, cancel_transport, select_transport_agents } } }.
// gridSettings/panelFilters são preservados como vieram do servidor; só tocamos em properties.transport_permissions.
function parsePreferencesString(str) {
  if (!str) return {};
  try {
    const obj = JSON.parse(str);
    return (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {};
  } catch (e) {
    return {};
  }
}

function getTransportPermission(key) {
  const tp = currentPreferencesObj && currentPreferencesObj.properties && currentPreferencesObj.properties.transport_permissions;
  const value = tp ? tp[key] : undefined;
  return value !== 'false'; // ausente/null = permitido por padrão, igual ao Multitone
}

function setTransportPermission(key, allowed) {
  if (!currentPreferencesObj.properties) currentPreferencesObj.properties = {};
  if (!currentPreferencesObj.properties.transport_permissions) currentPreferencesObj.properties.transport_permissions = {};
  currentPreferencesObj.properties.transport_permissions[key] = allowed ? 'true' : 'false';
}

function syncPreferencesUI() {
  document.getElementById('prefFinishTransport').checked = getTransportPermission('finish_transport');
  document.getElementById('prefCancelTransport').checked = getTransportPermission('cancel_transport');
  document.getElementById('prefSelectTransportAgents').checked = getTransportPermission('select_transport_agents');
  document.getElementById('userPreferences').value = JSON.stringify(currentPreferencesObj, null, 2);
}

function onTransportPermissionChange(key, checkbox) {
  setTransportPermission(key, checkbox.checked);
  preferencesTouched = true;
  document.getElementById('userPreferences').value = JSON.stringify(currentPreferencesObj, null, 2);
}

function onAdvancedPreferencesChange(textarea) {
  const raw = textarea.value.trim();
  if (!raw) {
    currentPreferencesObj = {};
    preferencesTouched = true;
    syncPreferencesUI();
    updateTabCounts();
    return;
  }
  try {
    currentPreferencesObj = JSON.parse(raw);
    preferencesTouched = true;
    syncPreferencesUI();
    updateTabCounts();
  } catch (e) {
    showToast('O campo Preferências (JSON) contém um conteúdo inválido.', 'error');
  }
}

function toggleAdvancedPreferences() {
  const wrapper = document.getElementById('advancedPrefsWrapper');
  const btn = document.getElementById('btnToggleAdvancedPrefs');
  const expanded = wrapper.style.display !== 'none';
  wrapper.style.display = expanded ? 'none' : '';
  btn.classList.toggle('expanded', !expanded);
}

// === RESTRIÇÃO DE EDIÇÃO PARA O PERFIL ADMINISTRADOR ===
// Administrador tem acesso total a leitos/eventos/grupos/alarmes/permissões de transporte por padrão
// no Multitone, então essas associações não fazem sentido (e não devem ser editadas) para esse perfil.
const ADMIN_RESTRICTED_CONTAINERS = ['bedsContainer', 'eventTypesContainer', 'staffGroupsContainer', 'alarmTypesContainer'];
const ADMIN_RESTRICTED_PREFS_INPUTS = ['prefFinishTransport', 'prefCancelTransport', 'prefSelectTransportAgents'];

function isAdminRoleSelected() {
  const idUserRights = parseInt(document.getElementById('userRights').value, 10);
  const role = (lookups && lookups.rights || []).find(r => r.id === idUserRights);
  return !!role && role.name.trim().toLowerCase() === 'administrador';
}

function applyAdminRestrictions() {
  const isAdmin = isAdminRoleSelected();

  ADMIN_RESTRICTED_CONTAINERS.forEach(id => {
    const container = document.getElementById(id);
    container.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.disabled = isAdmin; });
    container.classList.toggle('readonly-checklist', isAdmin);
  });

  ADMIN_RESTRICTED_PREFS_INPUTS.forEach(id => { document.getElementById(id).disabled = isAdmin; });
  document.getElementById('userPreferences').disabled = isAdmin;
  document.getElementById('btnToggleAdvancedPrefs').disabled = isAdmin;
  document.getElementById('selectAllEventTypes').disabled = isAdmin;

  document.querySelectorAll('.admin-lock-notice').forEach(notice => notice.classList.toggle('active', isAdmin));
}

// === ABRIR MODAIS DE CADASTRO/EDIÇÃO ===
function openCreateModal() {
  currentEditId = null;
  document.getElementById('userForm').reset();
  document.getElementById('userId').value = '';
  document.getElementById('userModalTitle').innerHTML = '<i class="fas fa-user-plus" style="color:var(--primary);margin-right:8px"></i>Novo Usuário';
  document.getElementById('userPassword').required = true;
  document.getElementById('passwordHint').textContent = 'Obrigatória para novos usuários.';
  document.getElementById('btnDeleteUser').style.display = 'none';
  currentPreferencesObj = {};
  preferencesTouched = false;
  document.getElementById('advancedPrefsWrapper').style.display = 'none';
  document.getElementById('btnToggleAdvancedPrefs').classList.remove('expanded');
  syncPreferencesUI();

  renderBedsHierarchy('bedsContainer', lookups.beds, []);
  renderGroupedChecklist('eventTypesContainer', lookups.eventTypes, [], true);
  renderGroupedChecklist('staffGroupsContainer', lookups.staffGroups, [], true);
  renderFlatChecklist('alarmTypesContainer', lookups.alarmTypes, []);
  applyAdminRestrictions();
  updateTabCounts();

  switchTab('dados');
  document.getElementById('userModal').classList.add('active');
}

async function openEditModal(id) {
  try {
    const response = await fetch(`api/users.jsp?id=${id}`);
    const user = await response.json();
    if (!response.ok) throw new Error(user.error || 'Erro ao carregar usuário.');

    currentEditId = id;
    document.getElementById('userForm').reset();
    document.getElementById('userId').value = user.id;
    document.getElementById('userLogin').value = user.login;
    document.getElementById('userName').value = user.name;
    document.getElementById('userRights').value = user.idUserRights;
    document.getElementById('userIpRegexp').value = user.ipRegexp || '';
    currentPreferencesObj = parsePreferencesString(user.preferences);
    preferencesTouched = false;
    document.getElementById('advancedPrefsWrapper').style.display = 'none';
    document.getElementById('btnToggleAdvancedPrefs').classList.remove('expanded');
    syncPreferencesUI();
    document.getElementById('userPassword').required = false;
    document.getElementById('passwordHint').textContent = 'Deixe em branco para manter a senha atual.';
    document.getElementById('userModalTitle').innerHTML = '<i class="fas fa-user-edit" style="color:var(--primary);margin-right:8px"></i>Editar Usuário';
    document.getElementById('btnDeleteUser').style.display = '';

    renderBedsHierarchy('bedsContainer', lookups.beds, user.beds);
    renderGroupedChecklist('eventTypesContainer', lookups.eventTypes, user.eventTypes, true);
    renderGroupedChecklist('staffGroupsContainer', lookups.staffGroups, user.staffGroups, true);
    renderFlatChecklist('alarmTypesContainer', lookups.alarmTypes, user.alarmTypes);
    applyAdminRestrictions();
    updateTabCounts();

    switchTab('dados');
    document.getElementById('userModal').classList.add('active');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function closeUserModal() {
  document.getElementById('userModal').classList.remove('active');
}

// === SALVAR (CREATE/UPDATE) ===
async function saveUser(event) {
  event.preventDefault();

  if (preferencesTouched) {
    const rawPreferences = document.getElementById('userPreferences').value.trim();
    if (rawPreferences) {
      try {
        JSON.parse(rawPreferences);
      } catch (e) {
        showToast('O campo Preferências (JSON) contém um conteúdo inválido.', 'error');
        switchTab('prefs');
        return;
      }
    }
  }

  const payload = {
    action: currentEditId ? 'update' : 'create',
    login: document.getElementById('userLogin').value.trim(),
    name: document.getElementById('userName').value.trim(),
    password: document.getElementById('userPassword').value,
    idUserRights: parseInt(document.getElementById('userRights').value, 10),
    ipRegexp: document.getElementById('userIpRegexp').value.trim(),
    beds: getCheckedIds('bedsContainer'),
    eventTypes: getCheckedIds('eventTypesContainer'),
    staffGroups: getCheckedIds('staffGroupsContainer'),
    alarmTypes: getCheckedIds('alarmTypesContainer')
  };
  if (currentEditId) payload.id = currentEditId;

  // Só envia "preferences" quando o admin de fato alterou as permissões de transporte ou o JSON avançado,
  // para não sobrescrever gridSettings/panelFilters gravados em paralelo pelo app desktop do Multitone.
  if (preferencesTouched) {
    payload.preferences = JSON.stringify(currentPreferencesObj);
  }

  const btnSave = document.getElementById('btnSaveUser');
  btnSave.disabled = true;
  btnSave.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

  try {
    const response = await fetch('api/users.jsp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Erro ao salvar usuário.');

    showToast(result.message || 'Salvo com sucesso!', 'success');
    closeUserModal();
    await loadUsers();
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    btnSave.disabled = false;
    btnSave.innerHTML = '<i class="fas fa-check" style="margin-right:6px"></i> Salvar Usuário';
  }
}

// === EXCLUIR ===
async function deleteUser(id) {
  if (!confirm('Deseja realmente excluir este usuário? Todas as associações de leitos, eventos, grupos e alarmes serão removidas. Esta ação não pode ser desfeita.')) return;
  try {
    const response = await fetch('api/users.jsp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Erro ao excluir usuário.');

    showToast(result.message || 'Usuário excluído com sucesso!', 'success');
    await loadUsers();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function deleteFromModal() {
  if (!currentEditId) return;
  closeUserModal();
  deleteUser(currentEditId);
}

// === MODAL "USAR COMO MODELO" ===
function openTemplateModal(id) {
  templateSourceUser = usersList.find(u => u.id === id);
  if (!templateSourceUser) return;

  document.getElementById('templateSourceName').textContent = templateSourceUser.name;
  document.getElementById('templateSourceLogin').textContent = '@' + templateSourceUser.login;

  document.getElementById('copyRights').checked = true;
  document.getElementById('copyBeds').checked = true;
  document.getElementById('copyEventTypes').checked = true;
  document.getElementById('copyStaffGroups').checked = true;
  document.getElementById('copyAlarmTypes').checked = true;
  document.getElementById('copyPreferences').checked = false;
  document.getElementById('templateTargetSearch').value = '';
  document.getElementById('selectAllTargets').checked = false;
  selectedTemplateTargetIds = new Set();

  populateTemplateRoleFilter();
  renderTemplateTargets();
  document.getElementById('templateModal').classList.add('active');
}

function populateTemplateRoleFilter() {
  const select = document.getElementById('templateTargetRoleFilter');
  const roles = Array.from(new Set(
    usersList.filter(u => u.id !== templateSourceUser.id).map(u => u.userRights)
  )).sort((a, b) => a.localeCompare(b));

  select.innerHTML = '<option value="">Todos os direitos</option>' +
    roles.map(r => `<option value="${escapeHtmlForAttr(r)}">${escapeHtml(r)}</option>`).join('');
}

function renderTemplateTargets() {
  const container = document.getElementById('templateTargetsList');
  const q = (document.getElementById('templateTargetSearch').value || '').toLowerCase().trim();
  const roleFilter = document.getElementById('templateTargetRoleFilter').value;

  const targets = usersList.filter(u =>
    u.id !== templateSourceUser.id &&
    (u.name.toLowerCase().includes(q) || u.login.toLowerCase().includes(q)) &&
    (!roleFilter || u.userRights === roleFilter)
  );

  if (targets.length === 0) {
    container.innerHTML = '<div class="checklist-empty">Nenhum outro usuário encontrado.</div>';
    document.getElementById('selectAllTargets').checked = false;
    return;
  }

  container.innerHTML = targets.map(u => `
    <div class="template-target-item">
      <label>
        <input type="checkbox" value="${u.id}" onchange="toggleTemplateTargetSelection(this)" ${selectedTemplateTargetIds.has(u.id) ? 'checked' : ''}>
        <span>${escapeHtml(u.name)}</span>
        <small>@${escapeHtml(u.login)} · ${escapeHtml(u.userRights)}</small>
      </label>
    </div>
  `).join('');

  document.getElementById('selectAllTargets').checked = targets.every(u => selectedTemplateTargetIds.has(u.id));
}

function toggleTemplateTargetSelection(checkbox) {
  const id = parseInt(checkbox.value, 10);
  if (checkbox.checked) selectedTemplateTargetIds.add(id);
  else selectedTemplateTargetIds.delete(id);
}

function toggleAllTemplateTargets(selectAllCheckbox) {
  const checked = selectAllCheckbox.checked;
  document.querySelectorAll('#templateTargetsList input[type="checkbox"]').forEach(cb => {
    cb.checked = checked;
    toggleTemplateTargetSelection(cb);
  });
}

function closeTemplateModal() {
  document.getElementById('templateModal').classList.remove('active');
  templateSourceUser = null;
}

async function applyTemplate() {
  const targetIds = Array.from(selectedTemplateTargetIds);

  if (targetIds.length === 0) {
    showToast('Selecione ao menos um usuário de destino.', 'error');
    return;
  }

  const copy = {
    rights: document.getElementById('copyRights').checked,
    beds: document.getElementById('copyBeds').checked,
    eventTypes: document.getElementById('copyEventTypes').checked,
    staffGroups: document.getElementById('copyStaffGroups').checked,
    alarmTypes: document.getElementById('copyAlarmTypes').checked,
    preferences: document.getElementById('copyPreferences').checked
  };

  if (!Object.values(copy).some(Boolean)) {
    showToast('Selecione ao menos uma configuração para replicar.', 'error');
    return;
  }

  const plural = targetIds.length > 1 ? `os ${targetIds.length} usuários selecionados` : 'o usuário selecionado';
  if (!confirm(`Replicar as configurações de "${templateSourceUser.name}" para ${plural}? As associações atuais (nos itens marcados) serão substituídas.`)) return;

  const btn = document.getElementById('btnApplyTemplate');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Aplicando...';

  try {
    const response = await fetch('api/user_template.jsp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId: templateSourceUser.id, targetIds, copy })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Erro ao replicar configurações.');

    showToast(result.message || 'Configurações replicadas com sucesso!', 'success');
    closeTemplateModal();
    await loadUsers();
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-clone" style="margin-right:6px"></i> Aplicar Modelo';
  }
}

// === HELPERS ===
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeHtmlForAttr(str) {
  if (!str) return '';
  return String(str).replace(/"/g, '&quot;');
}

// === TOAST ===
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
  toast.innerHTML = `
    <i class="fas ${icon}"></i>
    <span>${message}</span>
  `;

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
