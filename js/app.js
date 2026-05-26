const API_BASE_URL =
  localStorage.getItem("apiBaseUrl") ||
  (window.location.protocol === "file:" ? "http://localhost:5000" : window.location.port === "5000" ? "" : "http://localhost:5000");
const AUTH_MODAL_ID = "authModal";
const AUTH_TOKEN_KEY = "authToken";
const AUTH_USER_KEY = "authUser";

let authModalPromise = null;
let authModalResolve = null;

async function apiRequest(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;
  const token = getAuthToken();
  
  // Добавляем уникальный параметр для предотвращения кэширования GET-запросов
  const isGetRequest = !options.method || options.method === 'GET';
  const separator = url.includes('?') ? '&' : '?';
  const finalUrl = isGetRequest ? `${url}${separator}_t=${Date.now()}` : url;
  
  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
    // Явно указываем, что не хотим кэширования
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const settings = {
    method: options.method || "GET",
    credentials: options.credentials || "include",
    mode: "cors",
    cache: "no-store",
    headers
  };

  if (options.body !== undefined) {
    settings.body = JSON.stringify(options.body);
  }

  const response = await fetch(finalUrl, settings);
  if (response.status === 401) {
    setAuthToken("");
    setAuthUser(null);
    emitAuthChanged(null);
  }
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      (data && data.message) ||
      (Array.isArray(data) && data.join(", ")) ||
      "Request failed";
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return data;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function getCurrentUser() {
  const cachedUser = getAuthUser();

  try {
    const user = await apiRequest(`/api/auth/me?ts=${Date.now()}`);
    if (user) {
      setAuthUser(user);
    }
    return user || cachedUser;
  } catch (error) {
    if (error && error.status === 401) {
      setAuthToken("");
      setAuthUser(null);
      return null;
    }
    return cachedUser;
  }
}

function hasRole(user, role) {
  return Boolean(user && Array.isArray(user.roles) && user.roles.includes(role));
}

function notify(elementId, message, isError = false) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = message;
  el.className = isError ? "status error" : "status success";
}

function emitAuthChanged(user) {
  window.dispatchEvent(
    new CustomEvent("auth:changed", {
      detail: { user: user || null }
    })
  );
}

function getAuthToken() {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function setAuthToken(token) {
  try {
    if (!token) {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(AUTH_USER_KEY);
      return;
    }
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch {
    // ignore storage errors
  }
}

function getAuthUser() {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setAuthUser(user) {
  try {
    if (!user) {
      localStorage.removeItem(AUTH_USER_KEY);
      return;
    }
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  } catch {
    // ignore storage errors
  }
}

function handleExternalAuthChange() {
  const cachedUser = getAuthUser();
  if (cachedUser) {
    emitAuthChanged(cachedUser);
  }

  getCurrentUser().then((user) => {
    if (!user) {
      emitAuthChanged(null);
    } else {
      emitAuthChanged(user);
    }
  });
}

window.addEventListener("storage", (event) => {
  if (event.key === AUTH_TOKEN_KEY) {
    handleExternalAuthChange();
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    handleExternalAuthChange();
  }
});

function ensureAuthModal() {
  if (document.getElementById(AUTH_MODAL_ID)) {
    return document.getElementById(AUTH_MODAL_ID);
  }

  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <div id="${AUTH_MODAL_ID}" class="modal-overlay" hidden aria-hidden="true">
      <div class="modal-window" role="dialog" aria-modal="true" aria-labelledby="authModalTitle">
        <button id="authModalClose" type="button" class="modal-close" aria-label="Закрыть окно входа">×</button>
        <h2 id="authModalTitle">Вход в систему</h2>
        <p id="authModalLead" class="muted">Войдите, чтобы продолжить.</p>
        <div class="modal-tabs" role="tablist" aria-label="Выберите действие">
          <button id="authTabLogin" type="button" class="tab-btn is-active" role="tab" aria-selected="true">Вход</button>
          <button id="authTabRegister" type="button" class="tab-btn" role="tab" aria-selected="false">Регистрация</button>
        </div>

        <form id="authLoginForm" class="stack">
          <label for="authLoginEmail">Email</label>
          <input id="authLoginEmail" type="email" autocomplete="email" required>
          <label for="authLoginPassword">Пароль</label>
          <input id="authLoginPassword" type="password" autocomplete="current-password" required>
          <button type="submit">Войти</button>
        </form>

        <form id="authRegisterForm" class="stack" hidden>
          <label for="authRegisterName">Имя</label>
          <input id="authRegisterName" type="text" autocomplete="name" required>
          <label for="authRegisterEmail">Email</label>
          <input id="authRegisterEmail" type="email" autocomplete="email" required>
          <label for="authRegisterPassword">Пароль</label>
          <input id="authRegisterPassword" type="password" autocomplete="new-password" required>
          <label for="authRegisterRole">Роль</label>
          <select id="authRegisterRole">
            <option value="Reader">Читатель</option>
            <option value="Author">Автор статей</option>
          </select>
          <button type="submit">Создать аккаунт</button>
        </form>

        <p id="authModalStatus" class="status" role="status"></p>
      </div>
    </div>
  `;

  document.body.appendChild(wrapper.firstElementChild);

  const modal = document.getElementById(AUTH_MODAL_ID);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeAuthModal();
    }
  });

  document.getElementById("authModalClose").addEventListener("click", () => {
    closeAuthModal();
  });
  document.getElementById("authTabLogin").addEventListener("click", () => {
    setAuthModalTab("login");
  });
  document.getElementById("authTabRegister").addEventListener("click", () => {
    setAuthModalTab("register");
  });
  document.getElementById("authLoginForm").addEventListener("submit", onModalLogin);
  document.getElementById("authRegisterForm").addEventListener("submit", onModalRegister);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      const currentModal = document.getElementById(AUTH_MODAL_ID);
      if (currentModal && !currentModal.hidden) {
        closeAuthModal();
      }
    }
  });

  return modal;
}

function setAuthModalTab(mode) {
  const isLogin = mode !== "register";
  const loginTab = document.getElementById("authTabLogin");
  const registerTab = document.getElementById("authTabRegister");
  const loginForm = document.getElementById("authLoginForm");
  const registerForm = document.getElementById("authRegisterForm");
  const title = document.getElementById("authModalTitle");
  const lead = document.getElementById("authModalLead");

  loginTab.classList.toggle("is-active", isLogin);
  registerTab.classList.toggle("is-active", !isLogin);
  loginTab.setAttribute("aria-selected", String(isLogin));
  registerTab.setAttribute("aria-selected", String(!isLogin));
  loginForm.hidden = !isLogin;
  registerForm.hidden = isLogin;
  title.textContent = isLogin ? "Вход в систему" : "Регистрация";
  lead.textContent = isLogin
    ? "Войдите, чтобы продолжить."
    : "Создайте аккаунт за минуту.";
  notify("authModalStatus", "");

  const focusId = isLogin ? "authLoginEmail" : "authRegisterName";
  const focusInput = document.getElementById(focusId);
  if (focusInput) {
    focusInput.focus();
  }
}

function openAuthModal(mode = "login") {
  const modal = ensureAuthModal();
  setAuthModalTab(mode);
  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");

  if (!authModalPromise) {
    authModalPromise = new Promise((resolve) => {
      authModalResolve = resolve;
    });
  }

  return authModalPromise;
}

function closeAuthModal(user = null) {
  const modal = document.getElementById(AUTH_MODAL_ID);
  if (modal) {
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
  }

  document.body.classList.remove("modal-open");

  if (authModalResolve) {
    authModalResolve(user);
  }

  authModalPromise = null;
  authModalResolve = null;
}

async function onModalLogin(event) {
  event.preventDefault();
  const email = document.getElementById("authLoginEmail").value.trim();
  const password = document.getElementById("authLoginPassword").value;

  try {
    const user = await apiRequest("/api/auth/login", {
      method: "POST",
      credentials: "include",
      body: { email, password }
    });
    setAuthToken(user && typeof user.token === "string" ? user.token : "");
    setAuthUser(user);
    emitAuthChanged(user);
    closeAuthModal(user);
    window.location.reload();
  } catch (error) {
    notify("authModalStatus", error.message, true);
  }
}

async function onModalRegister(event) {
  event.preventDefault();
  const displayName = document.getElementById("authRegisterName").value.trim();
  const email = document.getElementById("authRegisterEmail").value.trim();
  const password = document.getElementById("authRegisterPassword").value;
  const role = document.getElementById("authRegisterRole").value;

  try {
    const user = await apiRequest("/api/auth/register", {
      method: "POST",
      credentials: "include",
      body: { displayName, email, password, role }
    });
    setAuthToken(user && typeof user.token === "string" ? user.token : "");
    setAuthUser(user);
    emitAuthChanged(user);
    closeAuthModal(user);
    window.location.reload();
  } catch (error) {
    notify("authModalStatus", error.message, true);
  }
}

async function requireAuth(preferredTab = "login") {
  const user = await getCurrentUser();
  if (user) {
    return user;
  }

  return openAuthModal(preferredTab);
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  
  toast.textContent = message;
  toast.hidden = false;
  
  requestAnimationFrame(() => {
    toast.classList.add("show");
    toast.classList.remove("hide");
  });
  
  setTimeout(() => {
    toast.classList.remove("show");
    toast.classList.add("hide");
    setTimeout(() => {
      toast.hidden = true;
    }, 300);
  }, 3000);
}

function renderHeaderButtons(user) {
  const guestActions = document.getElementById("guestActions");
  const authButtons = document.getElementById("authButtons");
  
  if (!user) {
    guestActions.hidden = false;
    authButtons.hidden = true;
    return;
  }
  
  guestActions.hidden = true;
  authButtons.hidden = false;
  
  let buttonsHtml = '';
  
  buttonsHtml += `<a href="support.html" class="help-btn btn-help-header" style="text-decoration:none;height:48px;padding:12px 18px;display:inline-flex;align-items:center;gap:8px;border-radius:12px;font-weight:700;color:white;">
    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:22px;height:22px;">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      <circle cx="9" cy="9" r="1"></circle>
      <circle cx="15" cy="9" r="1"></circle>
      <path d="M9 13h.01"></path>
      <path d="M15 13h.01"></path>
      <path d="M10 17h4"></path>
    </svg>
    <span>Нужна помощь?</span>
  </a>`;
  
  buttonsHtml += `<button id="logoutBtn" type="button" class="btn-logout">Выйти</button>`;
  
  authButtons.innerHTML = buttonsHtml;
  
  document.getElementById("logoutBtn").addEventListener("click", onLogout);
}

function renderAdminPanels(user) {
  const adminPanels = document.getElementById("adminPanels");
  
  if (!user || !Array.isArray(user.roles)) {
    adminPanels.hidden = true;
    adminPanels.innerHTML = '';
    return;
  }
  
  const isAuthor = user.roles.includes("Author");
  const isAdmin = user.roles.includes("Admin");
  
  if (!isAuthor && !isAdmin) {
    adminPanels.hidden = true;
    adminPanels.innerHTML = '';
    return;
  }
  
  adminPanels.hidden = false;
  
  let panelsHtml = '<div class="admin-panel-links">';
  
  if (isAuthor) {
    panelsHtml += `<a href="author.html" class="admin-panel-link">Панель автора</a>`;
  }
  
  if (isAdmin) {
    panelsHtml += `<a href="admin.html" class="admin-panel-link">Панель админа</a>`;
  }
  
  panelsHtml += '</div>';
  adminPanels.innerHTML = panelsHtml;
}

function updateGreeting(user) {
  const greetingEl = document.getElementById("greeting");
  if (!greetingEl) return;
  
  if (!user) {
    greetingEl.textContent = "Найдите нужную инструкцию за пару шагов.";
    return;
  }
  
  const userName = escapeHtml(user.displayName || user.name || "Пользователь");
  const userRole = Array.isArray(user.roles) && user.roles.length > 0 
    ? user.roles.join(", ") 
    : "Reader";
  
  // highlight user name
  greetingEl.innerHTML = `Здравствуйте, <strong>${userName}</strong> [${userRole}]. Что ищем сегодня?`;
}

async function onLogout() {
  try {
    await apiRequest("/api/auth/logout", { method: "POST", credentials: "include" });
  } catch {
    // ignore logout errors
  }
  setAuthToken("");
  setAuthUser(null);
  emitAuthChanged(null);
  showToast("Вы успешно вышли из системы");
  window.location.reload();
}
