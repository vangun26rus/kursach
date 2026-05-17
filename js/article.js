let articleId = null;
let currentUser = null;

async function initArticlePage() {
  ensureAuthModal();
  const params = new URLSearchParams(window.location.search);
  articleId = params.get("id");
  if (!articleId) {
    document.getElementById("title").textContent = "Статья не найдена";
    return;
  }

  currentUser = await getCurrentUser();
  await loadArticle();
  await loadSimilar();

  document.getElementById("commentForm").addEventListener("submit", onAddComment);
  document.getElementById("rateButtons").addEventListener("click", onRateArticle);
  document.getElementById("articleLoginBtn").addEventListener("click", () => onManualAuth("login"));
  document.getElementById("articleRegisterBtn").addEventListener("click", () => onManualAuth("register"));
  window.addEventListener("auth:changed", onAuthChanged);
}

async function loadArticle() {
  try {
    const article = await apiRequest(`/api/articles/${encodeURIComponent(articleId)}`);
    document.getElementById("title").textContent = article.title;
    document.getElementById("meta").innerHTML = `
      <span>Автор: ${escapeHtml(article.authorName)}</span>
      <span>Рейтинг статьи: ${article.averageRating.toFixed(2)} (${article.ratingsCount})</span>
      <span>Рейтинг автора: ${Number(article.authorAverageRating).toFixed(2)}</span>
    `;
    document.getElementById("content").innerHTML = article.contentHtml;
    document.getElementById("categories").textContent = article.categories.join(", ");

    renderComments(article.comments);
    updateFeedbackState(Boolean(currentUser));
  } catch (error) {
    document.getElementById("title").textContent = "Не удалось загрузить статью";
    notify("articleStatus", error.message, true);
  }
}

function renderComments(comments) {
  const list = document.getElementById("commentsList");
  if (!comments.length) {
    list.innerHTML = "<li>Комментариев пока нет.</li>";
    return;
  }

  list.innerHTML = "";
  for (const comment of comments) {
    const li = document.createElement("li");
    li.innerHTML = `
      <strong>${escapeHtml(comment.authorName)}</strong>
      <p>${escapeHtml(comment.text)}</p>
    `;
    list.appendChild(li);
  }
}

function updateFeedbackState(isAuthenticated) {
  const note = document.getElementById("authRequiredNote");
  const actions = document.getElementById("feedbackAuthActions");
  if (isAuthenticated) {
    note.textContent = "Вы вошли в систему. Можно оценивать статью и оставлять комментарии.";
    actions.hidden = true;
  } else {
    note.textContent = "Чтобы оставить оценку и комментарий, потребуется вход. Окно откроется автоматически при действии.";
    actions.hidden = false;
  }
}

async function ensureFeedbackAuth() {
  if (currentUser) {
    return currentUser;
  }

  const user = await requireAuth("login");
  if (!user) {
    return null;
  }

  currentUser = user;
  updateFeedbackState(true);
  return user;
}

async function onManualAuth(mode) {
  const user = await openAuthModal(mode);
  if (!user) return;

  currentUser = user;
  updateFeedbackState(true);
  notify("articleStatus", `Добро пожаловать, ${user.displayName}.`);
}

function onAuthChanged(event) {
  currentUser = event.detail && event.detail.user ? event.detail.user : null;
  updateFeedbackState(Boolean(currentUser));
}

async function onRateArticle(event) {
  const button = event.target.closest("button[data-rate]");
  if (!button) return;
  if (!(await ensureFeedbackAuth())) return;

  const score = Number(button.dataset.rate);
  try {
    await apiRequest(`/api/articles/${articleId}/rating`, {
      method: "POST",
      body: { score }
    });
    notify("ratingStatus", "Оценка сохранена.");
    await loadArticle();
  } catch (error) {
    notify("ratingStatus", error.message, true);
  }
}

async function onAddComment(event) {
  event.preventDefault();
  const text = document.getElementById("commentText").value.trim();
  if (!text) return;
  if (!(await ensureFeedbackAuth())) return;

  try {
    await apiRequest(`/api/articles/${articleId}/comments`, {
      method: "POST",
      body: { text }
    });
    document.getElementById("commentText").value = "";
    notify("articleStatus", "Комментарий добавлен.");
    await loadArticle();
  } catch (error) {
    notify("articleStatus", error.message, true);
  }
}

async function loadSimilar() {
  const list = document.getElementById("similarList");
  try {
    const items = await apiRequest(`/api/articles/${articleId}/similar`);
    if (!items.length) {
      list.innerHTML = "<li>Похожих статей пока нет.</li>";
      return;
    }

    list.innerHTML = "";
    for (const item of items) {
      const li = document.createElement("li");
      li.innerHTML = `<a href="article.html?id=${item.id}">${escapeHtml(item.title)}</a>`;
      list.appendChild(li);
    }
  } catch (error) {
    list.innerHTML = `<li>Не удалось загрузить похожие статьи: ${escapeHtml(error.message)}</li>`;
  }
}

initArticlePage();
