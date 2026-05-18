let currentUser = null;

function renderRatingStars(rating) {
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;
  let stars = '';

  for (let i = 0; i < 5; i++) {
    if (i < fullStars) {
      stars += '<svg class="star-icon" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>';
    } else if (i === fullStars && hasHalfStar) {
      stars += '<svg class="star-icon" viewBox="0 0 24 24" style="opacity:0.5;"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>';
    } else {
      stars += '<svg class="star-icon" viewBox="0 0 24 24" style="opacity:0.2;"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>';
    }
  }

  return stars;
}

async function initHistoryPage() {
  ensureAuthModal();
  currentUser = await getCurrentUser();
  window.addEventListener("auth:changed", onAuthChanged);
  window.addEventListener("focus", onWindowFocus);
  if (!currentUser) {
    renderLoginPrompt();
    return;
  }
  await loadHistory();
}

function onWindowFocus() {
  if (!currentUser) {
    return;
  }
  loadHistory();
}

function renderLoginPrompt() {
  const list = document.getElementById("historyList");
  const status = document.getElementById("historyStatus");
  status.textContent = "Войдите, чтобы увидеть вашу историю просмотров.";
  list.innerHTML = `<div class="panel"><p>Для доступа к истории необходимо <button id="openLoginBtn" type="button" class="secondary">Войти</button> или <button id="openRegisterBtn" type="button">Зарегистрироваться</button>.</p></div>`;
  document.getElementById("openLoginBtn")?.addEventListener("click", () => openAuthModal("login"));
  document.getElementById("openRegisterBtn")?.addEventListener("click", () => openAuthModal("register"));
}

async function onAuthChanged(event) {
  currentUser = event.detail?.user || null;
  if (!currentUser) {
    renderLoginPrompt();
    return;
  }
  await loadHistory();
}

async function loadHistory() {
  const list = document.getElementById("historyList");
  const status = document.getElementById("historyStatus");
  status.textContent = "";
  list.innerHTML = "<p>Загрузка...</p>";

  try {
    const historyItems = await apiRequest(`/api/users/history?ts=${Date.now()}`);
    if (!historyItems.length) {
      list.innerHTML = `<div class="panel"><p>История просмотров пока пуста.</p><p>Откройте статью, чтобы сохранить её в истории.</p></div>`;
      return;
    }

    list.innerHTML = "";
    for (const item of historyItems) {
      const card = document.createElement("article");
      card.className = "card catalog-card";
      const ratingStars = renderRatingStars(item.averageRating);
      const viewedDate = new Date(item.viewedAt).toLocaleString("ru-RU", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });

      card.innerHTML = `
        <h3><a href="article.html?id=${item.id}">${escapeHtml(item.title)}</a></h3>
        <p>${escapeHtml(item.summary)}</p>
        <p class="muted" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;">
          <span style="display:inline-flex;align-items:center;gap:6px;">
            <svg class="icon" viewBox="0 0 24 24" fill="currentColor" style="width:18px;height:18px;color:#5a7d9a;"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
            ${escapeHtml(item.authorName)}
          </span>
          <span class="rating-stars" style="display:inline-flex;align-items:center;gap:3px;">
            ${ratingStars}
            <span style="color:var(--muted);font-weight:500;font-size:0.9rem;">(${item.ratingsCount})</span>
          </span>
        </p>
        <p class="muted history-date">Просмотрено: ${escapeHtml(viewedDate)}</p>
      `;
      list.appendChild(card);
    }
  } catch (error) {
    list.innerHTML = `<div class="panel"><p>Ошибка загрузки: ${escapeHtml(error.message)}</p></div>`;
  }
}

initHistoryPage();
