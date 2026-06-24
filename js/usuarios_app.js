// Estado global
let mgUsers = [];

document.addEventListener('DOMContentLoaded', loadUsers);

// === CARREGAR REGISTROS ===
async function loadUsers() {
  const tableBody = document.getElementById('tableBody');
  try {
    const response = await fetch('api/mg_users.jsp');
    if (!response.ok) {
      throw new Error('Falha ao carregar usuários do sistema.');
    }

    mgUsers = await response.json();
    if (!Array.isArray(mgUsers)) mgUsers = [];

    renderTable();
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
function renderTable() {
  const tableBody = document.getElementById('tableBody');
  const countBadge = document.getElementById('countBadge');

  countBadge.textContent = mgUsers.length;

  if (mgUsers.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center;padding:40px;color:var(--text-muted)">
          Nenhum usuário cadastrado.
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = mgUsers.map(u => `
    <tr onclick="openEditModal(${u.id})" style="cursor:pointer;" title="Clique para editar">
      <td>${escapeHtml(u.nome) || '-'}</td>
      <td><strong>${escapeHtml(u.login)}</strong>${u.isSelf ? ' <span class="badge" style="font-size:10px;">você</span>' : ''}</td>
      <td>
        ${u.mustChangePassword
          ? '<span style="color:var(--warning);"><i class="fas fa-exclamation-circle" style="margin-right:6px"></i>Pendente</span>'
          : '<span style="color:var(--text-muted);"><i class="fas fa-check-circle" style="margin-right:6px"></i>Não</span>'}
      </td>
      <td>${formatDateTime(u.createdAt)}</td>
      <td style="text-align:center;" onclick="event.stopPropagation()">
        <button class="btn-icon" onclick="openEditModal(${u.id})" title="Editar"><i class="fas fa-edit"></i></button>
        ${!u.isSelf ? `<button class="btn-icon delete" onclick="deleteUser(${u.id})" title="Excluir" style="margin-left:8px;"><i class="fas fa-trash-alt"></i></button>` : ''}
      </td>
    </tr>
  `).join('');
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value.replace(' ', 'T'));
  if (isNaN(date.getTime())) return value;
  return date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// === MODAL CRIAR ===
function openCreateModal() {
  document.getElementById('userModalTitle').innerHTML = '<i class="fas fa-user-plus" style="color:var(--primary);margin-right:8px"></i>Novo Usuário';
  document.getElementById('userId').value = '';
  document.getElementById('userNome').value = '';
  document.getElementById('userLogin').value = '';
  document.getElementById('userLogin').disabled = false;
  document.getElementById('userPassword').value = '';
  document.getElementById('userPassword').required = true;
  document.getElementById('userPasswordLabel').textContent = 'Senha';
  document.getElementById('userPasswordHint').style.display = 'none';
  document.getElementById('userMustChangePassword').checked = true;

  document.getElementById('userModal').classList.add('active');
  document.getElementById('userLogin').focus();
}

// === MODAL EDITAR ===
function openEditModal(id) {
  const user = mgUsers.find(u => u.id === id);
  if (!user) return;

  document.getElementById('userModalTitle').innerHTML = '<i class="fas fa-user-edit" style="color:var(--primary);margin-right:8px"></i>Editar Usuário';
  document.getElementById('userId').value = user.id;
  document.getElementById('userNome').value = user.nome || '';
  document.getElementById('userLogin').value = user.login;
  document.getElementById('userLogin').disabled = false;
  document.getElementById('userPassword').value = '';
  document.getElementById('userPassword').required = false;
  document.getElementById('userPasswordLabel').textContent = 'Nova senha';
  document.getElementById('userPasswordHint').style.display = '';
  document.getElementById('userMustChangePassword').checked = user.mustChangePassword;

  document.getElementById('userModal').classList.add('active');
  document.getElementById('userLogin').focus();
}

function closeModal() {
  document.getElementById('userModal').classList.remove('active');
}

// === SALVAR (Create/Update) ===
async function saveUser(event) {
  event.preventDefault();

  const id = document.getElementById('userId').value;
  const nome = document.getElementById('userNome').value.trim();
  const login = document.getElementById('userLogin').value.trim();
  const password = document.getElementById('userPassword').value;
  const mustChangePassword = document.getElementById('userMustChangePassword').checked;

  if (!nome || !login) return;

  const isUpdate = !!id;
  const action = isUpdate ? 'update' : 'create';
  const payload = { action, nome, login, mustChangePassword };
  if (password) payload.password = password;
  if (isUpdate) payload.id = parseInt(id, 10);

  try {
    const response = await fetch('api/mg_users.jsp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Erro ao salvar usuário.');
    }

    showToast(result.message || 'Salvo com sucesso!', 'success');
    closeModal();
    await loadUsers();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// === EXCLUIR ===
async function deleteUser(id) {
  if (!confirm('Deseja realmente excluir este usuário? Ele perderá o acesso a esta ferramenta imediatamente.')) return;

  try {
    const response = await fetch('api/mg_users.jsp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id })
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Erro ao excluir usuário.');
    }

    showToast(result.message || 'Usuário excluído com sucesso!', 'success');
    await loadUsers();
  } catch (error) {
    showToast(error.message, 'error');
  }
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

// === LOGOUT ===
async function logout() {
  try {
    await fetch('api/logout.jsp');
    window.location.replace('login.html');
  } catch (error) {
    window.location.replace('login.html');
  }
}
