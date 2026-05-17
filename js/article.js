let articleId = null;
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
    
    const authorIcon = '<svg class="icon" viewBox="0 0 24 24" fill="currentColor" style="width:18px;height:18px;"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';
    const starIcon = '<svg class="icon" viewBox="0 0 24 24" fill="currentColor" style="width:18px;height:18px;"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>';
    
    document.getElementById("meta").innerHTML = `
      <span class="article-meta-item">
        ${authorIcon}
        Автор: ${escapeHtml(article.authorName)}
      </span>
      <span class="article-meta-item">
        ${starIcon}
        Рейтинг статьи: ${renderRatingStars(article.averageRating)}
        <span style="color:var(--muted);font-weight:500;font-size:0.95rem;">(${article.ratingsCount})</span>
      </span>
      <span class="article-meta-item">
        ${starIcon}
        Рейтинг автора: ${Number(article.authorAverageRating).toFixed(2)}
      </span>
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
      <div class="comment-author">
        <span class="user-icon">
          <svg class="icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
        </span>
        <strong>${escapeHtml(comment.authorName)}</strong>
      </div>
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
