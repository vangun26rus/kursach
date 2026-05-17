async function initAdminPage() {
  ensureAuthModal();
  const user = await getCurrentUser();
  if (!user) {
    notify("adminStatus", "Нужен вход в систему. Открываю форму входа…", true);
    const loggedInUser = await openAuthModal("login");
    if (!loggedInUser) {
      notify("adminStatus", "Вход отменён. Панель администратора недоступна.", true);
      return;
    }
    if (!hasRole(loggedInUser, "Admin")) {
      notify("adminStatus", "У вашей учётной записи нет роли Admin.", true);
      return;
    }
  } else if (!hasRole(user, "Admin")) {
    notify("adminStatus", "У вашей учётной записи нет роли Admin.", true);
    return;
  }

  await loadDashboard();
  await loadUsers();
}

async function loadDashboard() {
  try {
    const dashboard = await apiRequest("/api/admin/dashboard");
    document.getElementById("adminStats").innerHTML = `
      <p>Пользователей: <strong>${dashboard.totalUsers}</strong></p>
      <p>Статей всего: <strong>${dashboard.totalArticles}</strong></p>
      <p>Опубликовано: <strong>${dashboard.publishedArticles}</strong></p>
      <p>Открытых тикетов: <strong>${dashboard.openTickets}</strong></p>
      <p>Комментариев: <strong>${dashboard.totalComments}</strong></p>
    `;
  } catch (error) {
    notify("adminStatus", error.message, true);
  }
}

async function loadUsers() {
  const table = document.getElementById("usersTableBody");
  table.innerHTML = "<tr><td colspan='4'>Загрузка...</td></tr>";

  try {
    const users = await apiRequest("/api/admin/users");
    if (!users.length) {
      table.innerHTML = "<tr><td colspan='4'>Пользователей нет.</td></tr>";
      return;
    }

    table.innerHTML = "";
    for (const user of users) {
      const currentRole = user.roles[0] || "Reader";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(user.displayName)}</td>
        <td>${escapeHtml(user.email)}</td>
        <td>
          <select data-user-id="${user.id}">
            <option value="Reader" ${currentRole === "Reader" ? "selected" : ""}>Reader</option>
            <option value="Author" ${currentRole === "Author" ? "selected" : ""}>Author</option>
            <option value="Admin" ${currentRole === "Admin" ? "selected" : ""}>Admin</option>
          </select>
        </td>
        <td><button data-save-role="${user.id}">Сохранить</button></td>
      `;
      table.appendChild(tr);
    }

    table.querySelectorAll("button[data-save-role]").forEach((button) => {
      button.addEventListener("click", onSaveRole);
    });
  } catch (error) {
    table.innerHTML = `<tr><td colspan='4'>Ошибка: ${escapeHtml(error.message)}</td></tr>`;
  }
}

async function onSaveRole(event) {
  const userId = event.currentTarget.dataset.saveRole;
  const select = document.querySelector(`select[data-user-id="${userId}"]`);
  const role = select.value;

  try {
    await apiRequest(`/api/admin/users/${userId}/role`, {
      method: "PUT",
      body: { role }
    });
    notify("adminStatus", "Роль обновлена.");
    await loadUsers();
  } catch (error) {
    notify("adminStatus", error.message, true);
  }
}

initAdminPage();
