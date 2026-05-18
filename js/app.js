const API_BASE_URL =
  localStorage.getItem("apiBaseUrl") ||
  (window.location.port === "5000" ? "" : "http://localhost:5000");
const AUTH_MODAL_ID = "authModal";
const AUTH_TOKEN_KEY = "authToken";

let authModalPromise = null;
let authModalResolve = null;

async function apiRequest(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;
  const token = getAuthToken();
  const settings = {
    method: options.method || "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  };

  if (options.body !== undefined) {
    settings.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, settings);
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
    throw new Error(message);
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
  try {
    return await apiRequest("/api/auth/me");
  } catch {
    return null;
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
      return;
    }
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch {
    // ignore storage errors
  }
}

function ensureAuthModal() {
  if (document.getElementById(AUTH_MODAL_ID)) {
    return document.getElementById(AUTH_MODAL_ID);
  }

  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <div id="${AUTH_MODAL_ID}" class="modal-overlay" hidden aria-hidden="true">
      <div class="modal-window" role="dialog" aria-modal="true" aria-labelledby="authModalTitle">
        <button id="authModalClose" type="button" class="modal-close" aria-label="Закрыть окно входа">x</button>
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
      body: { email, password }
    });
    setAuthToken(user && typeof user.token === "string" ? user.token : "");
    emitAuthChanged(user);
    closeAuthModal(user);
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
      body: { displayName, email, password, role }
    });
    setAuthToken(user && typeof user.token === "string" ? user.token : "");
    emitAuthChanged(user);
    closeAuthModal(user);
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
  
  const roleLinksMap = {
    "Admin": { text: "Панель админа", href: "admin.html" },
    "Author": { text: "Панель автора", href: "author.html" }
  };
  
  let buttonsHtml = '';
  
  buttonsHtml += `<a href="support.html" class="help-btn btn-help-header" style="text-decoration:none;">Нужна помощь?</a>`;
  
  if (Array.isArray(user.roles)) {
    user.roles.forEach(role => {
      const linkInfo = roleLinksMap[role];
      if (linkInfo) {
        buttonsHtml += `<a href="${linkInfo.href}" class="secondary" style="text-decoration:none;height:48px;padding:0 18px;display:inline-flex;align-items:center;border-radius:12px;font-weight:700;">${linkInfo.text}</a>`;
      }
    });
  }
  
  buttonsHtml += `<button id="logoutBtn" type="button" class="btn-logout">Выйти</button>`;
  
  authButtons.innerHTML = buttonsHtml;
  
  document.getElementById("logoutBtn").addEventListener("click", onLogout);
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
  
  greetingEl.textContent = `Здравствуйте, ${userName} [${userRole}]. Что ищем сегодня?`;
}

async function onLogout() {
  try {
    await apiRequest("/api/auth/logout", { method: "POST" });
  } catch {
    // ignore logout errors
  }
  setAuthToken("");
  emitAuthChanged(null);
  showToast("Вы успешно вышли из системы");
}
