// Estado global da aplicação
let motivos = [];
let sortColumn = 'patientDelay';
let sortDirection = 'asc';

document.addEventListener('DOMContentLoaded', () => {
  // Inicializa data/hora e carrega motivos
  updateDateTime();
  setInterval(updateDateTime, 1000);
  
  loadMotivos();
});

// === DATA E HORA DA TOP BAR ===
function updateDateTime() {
  const el = document.getElementById('topDateTime');
  if (!el) return;
  const now = new Date();
  const options = { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit',
    second: '2-digit'
  };
  el.textContent = now.toLocaleDateString('pt-BR', options);
}

// === CARREGAR REGISTROS ===
async function loadMotivos() {
  const tableBody = document.getElementById('tableBody');
  const countBadge = document.getElementById('countBadge');
  
  try {
    const response = await fetch('api/motivos.jsp');
    if (!response.ok) {
      throw new Error('Falha ao carregar motivos do banco de dados.');
    }
    
    motivos = await response.json();
    if (!Array.isArray(motivos)) {
      motivos = [];
    }
    
    updateSortHeaders();
    renderTable();
  } catch (error) {
    showToast(error.message, 'error');
    tableBody.innerHTML = `
      <tr>
        <td colspan="3" style="text-align:center;padding:40px;color:var(--danger)">
          <i class="fas fa-exclamation-triangle" style="margin-right:6px"></i> Erro ao carregar dados.
        </td>
      </tr>
    `;
  }
}

// === RENDERIZAR TABELA ===
function renderTable() {
  const tableBody = document.getElementById('tableBody');
  const countBadge = document.getElementById('countBadge');
  const searchInput = document.getElementById('searchInput');
  const q = searchInput ? searchInput.value.toLowerCase().trim() : '';

  // Filtragem local
  let filtered = motivos.filter(item => 
    item.patientDelay && item.patientDelay.toLowerCase().includes(q)
  );

  // Ordenação local
  filtered.sort((a, b) => {
    let valA = a[sortColumn];
    let valB = b[sortColumn];
    
    if (typeof valA === 'string') {
      valA = valA.toLowerCase();
      valB = valB.toLowerCase();
      return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    } else {
      return sortDirection === 'asc' ? valA - valB : valB - valA;
    }
  });

  countBadge.textContent = filtered.length;

  if (filtered.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="3" style="text-align:center;padding:40px;color:var(--text-muted)">
          Nenhum motivo de atraso encontrado.
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = filtered.map(item => `
    <tr onclick="onRowClick(event, ${item.id}, '${escapeHtmlForAttr(item.patientDelay)}')" style="cursor: pointer;">
      <td><strong>#${item.id}</strong></td>
      <td>${escapeHtml(item.patientDelay)}</td>
      <td style="text-align:center;" onclick="event.stopPropagation()">
        <button class="btn-icon" onclick="openEditModal(${item.id}, '${escapeHtmlForAttr(item.patientDelay)}')" title="Editar">
          <i class="fas fa-edit"></i>
        </button>
        <button class="btn-icon delete" onclick="deleteMotivo(${item.id})" title="Excluir" style="margin-left:8px;">
          <i class="fas fa-trash-alt"></i>
        </button>
      </td>
    </tr>
  `).join('');
}

// === FILTRAGEM / BUSCA RÁPIDA ===
function filterList() {
  renderTable();
}

// === SALVAR NOVO REGISTRO (Create) ===
async function saveMotivo(event) {
  event.preventDefault();
  const input = document.getElementById('newMotivo');
  const val = input.value.trim();
  if (!val) return;

  const btnSave = document.getElementById('btnSave');
  btnSave.disabled = true;
  btnSave.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cadastrando...';

  try {
    const response = await fetch('api/motivos.jsp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', patientDelay: val })
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Erro ao cadastrar motivo.');
    }

    showToast(result.message || 'Cadastrado com sucesso!', 'success');
    input.value = '';
    
    // Atualizar lista
    await loadMotivos();
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    btnSave.disabled = false;
    btnSave.innerHTML = '<i class="fas fa-save" style="margin-right:6px"></i> Cadastrar Motivo';
  }
}

// === ATUALIZAR REGISTRO (Update) ===
async function updateMotivo(event) {
  event.preventDefault();
  const idInput = document.getElementById('editId');
  const valInput = document.getElementById('editMotivo');
  const id = idInput.value;
  const val = valInput.value.trim();

  if (!val || !id) return;

  try {
    const response = await fetch('api/motivos.jsp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', id: parseInt(id), patientDelay: val })
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Erro ao atualizar motivo.');
    }

    showToast(result.message || 'Atualizado com sucesso!', 'success');
    closeModal();
    
    // Atualizar lista
    await loadMotivos();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// === EXCLUIR REGISTRO (Delete) ===
async function deleteMotivo(id) {
  if (!confirm('Deseja realmente excluir este motivo de atraso? Esta ação não pode ser desfeita.')) return;

  try {
    const response = await fetch('api/motivos.jsp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id: id })
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Erro ao excluir motivo.');
    }

    showToast(result.message || 'Motivo excluído com sucesso!', 'success');
    await loadMotivos();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// === MODAL DE EDIÇÃO ===
function openEditModal(id, val) {
  const modal = document.getElementById('editModal');
  const editId = document.getElementById('editId');
  const editMotivo = document.getElementById('editMotivo');
  
  editId.value = id;
  editMotivo.value = val;
  
  modal.classList.add('active');
  editMotivo.focus();
}

function closeModal() {
  const modal = document.getElementById('editModal');
  modal.classList.remove('active');
}

// === CLICK DA LINHA DA TABELA ===
function onRowClick(event, id, val) {
  if (event.target.closest('button') || event.target.closest('.btn-icon')) {
    return;
  }
  openEditModal(id, val);
}

// === ORDENAÇÃO DE COLUNAS ===
function changeSort(column) {
  if (sortColumn === column) {
    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    sortColumn = column;
    sortDirection = 'asc';
  }
  updateSortHeaders();
  renderTable();
}

function updateSortHeaders() {
  const iconId = document.getElementById('sort-icon-id');
  const iconDelay = document.getElementById('sort-icon-patientDelay');
  
  if (!iconId || !iconDelay) return;
  
  iconId.className = 'fas fa-sort';
  iconId.style.color = 'var(--text-muted)';
  
  iconDelay.className = 'fas fa-sort';
  iconDelay.style.color = 'var(--text-muted)';
  
  if (sortColumn === 'id') {
    iconId.className = sortDirection === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
    iconId.style.color = 'var(--primary)';
  } else if (sortColumn === 'patientDelay') {
    iconDelay.className = sortDirection === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
    iconDelay.style.color = 'var(--primary)';
  }
}

// === EXCLUIR PELO MODAL ===
async function deleteFromModal() {
  const idInput = document.getElementById('editId');
  const id = parseInt(idInput.value);
  if (!id) return;
  
  if (!confirm('Deseja realmente excluir este motivo de atraso? Esta ação não pode ser desfeita.')) return;
  
  try {
    const response = await fetch('api/motivos.jsp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id: id })
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Erro ao excluir motivo.');
    }

    showToast(result.message || 'Motivo excluído com sucesso!', 'success');
    closeModal();
    await loadMotivos();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// === EXIBIÇÃO DE TOAST ===
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
  
  // Remove o toast após 4s
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 200);
  }, 4000);
}

// === HELPERS ===
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeHtmlForAttr(str) {
  if (!str) return '';
  return str.replace(/'/g, "\\'");
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
