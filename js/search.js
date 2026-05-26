let currentUser = null;

async function initIndexPage() {
  ensureAuthModal();
  currentUser = await getCurrentUser();
  renderSession();
  document.getElementById("results").innerHTML = "";

  document.getElementById("searchBtn").addEventListener("click", searchArticles);
  document.getElementById("searchInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      searchArticles();
    }
  });
  document.getElementById("openLoginBtn").addEventListener("click", () => openAuthModal("login"));
  document.getElementById("openRegisterBtn").addEventListener("click", () => openAuthModal("register"));
  window.addEventListener("auth:changed", onAuthChanged);
}

function renderSession() {
  updateGreeting(currentUser);
  renderHeaderButtons(currentUser);
  renderAdminPanels(currentUser);
  renderUserCards(currentUser);
}

function renderUserCards(user) {
  const cardsContainer = document.getElementById("userQuickCards");
  if (!cardsContainer) {
    return;
  }

  if (!user) {
    cardsContainer.innerHTML = "";
    return;
  }

  cardsContainer.innerHTML = `
    <a class="panel quick-card" href="favorites.html">
      <div class="card-header">
        <div class="card-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 21s-7-5.5-7-10.5A4.5 4.5 0 0 1 9.5 6 4.5 4.5 0 0 1 12 8.2 4.5 4.5 0 0 1 14.5 6 4.5 4.5 0 0 1 21 10.5C21 15.5 12 21 12 21z"></path>
          </svg>
        </div>
        <h2>Избранное</h2>
      </div>
      <p class="muted">Сохранённые статьи, к которым вы вернётесь позже.</p>
    </a>
    <a class="panel quick-card" href="history.html">
      <div class="card-header">
        <div class="card-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="8"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="12" x2="15" y2="15"></line>
          </svg>
        </div>
        <h2>История просмотров</h2>
      </div>
      <p class="muted">Последние статьи, которые вы уже читали.</p>
    </a>
  `;
}

function onAuthChanged(event) {
  currentUser = event.detail && event.detail.user ? event.detail.user : null;
  if (!currentUser) {
    setAuthToken("");
  }
  renderSession();
  if (currentUser) {
    showToast(`Вход выполнен. Добро пожаловать, ${currentUser.displayName}.`);
  }
}

async function searchArticles() {
  const query = document.getElementById("searchInput").value.trim();
  const resultsList = document.getElementById("results");
  if (!query) {
    resultsList.innerHTML = "";
    return;
  }
  resultsList.innerHTML = "<li>Загрузка...</li>";

  try {
    const searchQueries = buildSearchQueries(query);
    const articles = await loadArticlesForQueries(searchQueries);
    if (!articles.length) {
      resultsList.innerHTML = "<li>Ничего не найдено.</li>";
      return;
    }

    resultsList.innerHTML = "";
    for (const article of articles) {
      const li = document.createElement("li");
      li.innerHTML = `
        <a class="result-title" href="article.html?id=${article.id}">${escapeHtml(article.title)}</a>
        <p class="muted">${escapeHtml(article.summary)}</p>
        <p class="muted" style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;">
          <span>Автор: ${escapeHtml(article.authorName)}</span>
          <span class="rating-stars">${renderRatingStars(article.averageRating || 0)}</span>
          <span style="color:var(--muted);font-weight:500;font-size:0.92rem;">(${article.ratingsCount || 0})</span>
        </p>
      `;
      resultsList.appendChild(li);
    }
  } catch (error) {
    resultsList.innerHTML = `<li>Ошибка: ${escapeHtml(error.message)}</li>`;
  }
}

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

function buildSearchQueries(query) {
  const source = query.trim().toLowerCase();
  const variants = new Set([source]);

  for (const token of source.split(/\s+/).filter(Boolean)) {
    if (token.length >= 5 && /[а-яё]/i.test(token)) {
      variants.add(stemRussianToken(token));
    }

    if (token === "wifi" || token === "wi-fi" || token === "вайфай" || token === "вай фай") {
      variants.add("wifi");
      variants.add("вайфай");
      variants.add("wi fi");
    }
  }

  return Array.from(variants).filter(Boolean);
}

function stemRussianToken(token) {
  const endings = ["иями", "ями", "ами", "ого", "ему", "ому", "ий", "ый", "ой", "ах", "ях", "ам", "ям", "а", "я", "ы", "и", "е", "о", "у", "ю"];
  for (const ending of endings) {
    if (token.endsWith(ending) && token.length - ending.length >= 3) {
      return token.slice(0, -ending.length);
    }
  }
  return token;
}

async function loadArticlesForQueries(queries) {
  const byId = new Map();

  for (const q of queries) {
    const items = await apiRequest(`/api/articles?search=${encodeURIComponent(q)}`);
    for (const article of items) {
      if (!byId.has(article.id)) {
        byId.set(article.id, article);
      }
    }
  }

  return Array.from(byId.values());
}

initIndexPage();
