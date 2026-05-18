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
      <div class="card-icon">
        <span style="font-size:32px;line-height:1;">♥</span>
      </div>
      <h2>Избранное</h2>
      <p class="muted">Сохранённые статьи, к которым вы вернётесь позже.</p>
    </a>
    <a class="panel quick-card" href="history.html">
      <div class="card-icon">
        <span style="font-size:32px;line-height:1;">🕐</span>
      </div>
      <h2>История просмотров</h2>
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
        <p class="muted">Автор: ${escapeHtml(article.authorName)} | Рейтинг: ${article.averageRating.toFixed(2)} (${article.ratingsCount})</p>
      `;
      resultsList.appendChild(li);
    }
  } catch (error) {
    resultsList.innerHTML = `<li>Ошибка: ${escapeHtml(error.message)}</li>`;
  }
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
