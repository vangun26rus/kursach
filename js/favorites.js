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

async function initFavoritesPage() {
  ensureAuthModal();
  currentUser = await getCurrentUser();
  window.addEventListener("auth:changed", onAuthChanged);
  if (!currentUser) {
    renderLoginPrompt();
    return;
  }
  await loadFavorites();
}

function renderLoginPrompt() {
  const list = document.getElementById("favoritesList");
  const status = document.getElementById("favoritesStatus");
  status.textContent = "Войдите, чтобы увидеть ваши избранные статьи.";
  list.innerHTML = `<div class="panel"><p>Для доступа к избранному необходимо <button id="openLoginBtn" type="button" class="secondary">Войти</button> или <button id="openRegisterBtn" type="button">Зарегистрироваться</button>.</p></div>`;
  document.getElementById("openLoginBtn")?.addEventListener("click", () => openAuthModal("login"));
  document.getElementById("openRegisterBtn")?.addEventListener("click", () => openAuthModal("register"));
}

async function onAuthChanged(event) {
  currentUser = event.detail?.user || null;
  if (!currentUser) {
    renderLoginPrompt();
    return;
  }
  await loadFavorites();
}

async function loadFavorites() {
  const list = document.getElementById("favoritesList");
  const status = document.getElementById("favoritesStatus");
  status.textContent = "";
  list.innerHTML = "<p>Загрузка...</p>";

  try {
    const favorites = await apiRequest("/api/users/favorites");
    if (!favorites || !favorites.length) {
      list.innerHTML = `<div class="panel"><p>У вас пока нет избранных статей.</p><p>Добавьте статью в избранное на странице статьи.</p></div>`;
      return;
    }

    list.innerHTML = "";
    for (const article of favorites) {
      const card = document.createElement("article");
      card.className = "card catalog-card";
      const ratingStars = renderRatingStars(article.averageRating || 0);
      card.innerHTML = `
        <h3><a href="article.html?id=${article.id}">${escapeHtml(article.title)}</a></h3>
        <p>${escapeHtml(article.summary)}</p>
        <p class="muted" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;">
          <span style="display:inline-flex;align-items:center;gap:6px;">
            <svg class="icon" viewBox="0 0 24 24" fill="currentColor" style="width:18px;height:18px;color:#5a7d9a;"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
            ${escapeHtml(article.authorName)}
          </span>
          <span class="rating-stars" style="display:inline-flex;align-items:center;gap:3px;">
            ${ratingStars}
            <span style="color:var(--muted);font-weight:500;font-size:0.9rem;">(${article.ratingsCount || 0})</span>
          </span>
        </p>
      `;
      list.appendChild(card);
    }
  } catch (error) {
    console.error("Ошибка загрузки избранного:", error);
    list.innerHTML = `<div class="panel"><p>Ошибка загрузки: ${escapeHtml(error.message)}</p></div>`;
  }
}

initFavoritesPage();
