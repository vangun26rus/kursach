let articleSteps = [];
let editingArticleId = null;

async function initAuthorPage() {
  ensureAuthModal();
  const user = await getCurrentUser();
  if (!user) {
    notify("authorStatus", "Нужен вход в систему. Открываю форму входа…", true);
    const loggedInUser = await openAuthModal("login");
    if (!loggedInUser) {
      notify("authorStatus", "Вход отменён. Панель автора недоступна.", true);
      return;
    }
    if (!hasRole(loggedInUser, "Author") && !hasRole(loggedInUser, "Admin")) {
      notify("authorStatus", "Нужна роль Author или Admin.", true);
      return;
    }
  } else if (!hasRole(user, "Author") && !hasRole(user, "Admin")) {
    notify("authorStatus", "Нужна роль Author или Admin.", true);
    return;
  }

  initStepTemplateBuilder();
  initArticleEditor();
  await loadDashboard();
}

function initArticleEditor() {
  document.getElementById("articleForm").addEventListener("submit", onSaveArticle);
  document.getElementById("articleCancelBtn").addEventListener("click", cancelEditMode);
  document.getElementById("myArticles").addEventListener("click", onArticleListAction);
  updateEditorUi();
}

function initStepTemplateBuilder() {
  document.getElementById("addStepBtn").addEventListener("click", onAddStep);
  document.getElementById("importStepsBtn").addEventListener("click", onImportStepsFromContent);
  document.getElementById("clearStepsBtn").addEventListener("click", onClearSteps);
  document.getElementById("stepsPreview").addEventListener("click", onDeleteStep);
  renderStepsPreview();
}

async function loadDashboard() {
  try {
    const data = await apiRequest("/api/author/dashboard");
    document.getElementById("authorStats").innerHTML = `
      <p>Средний рейтинг автора: <strong>${Number(data.averageRating).toFixed(2)}</strong></p>
      <p>Опубликовано статей: <strong>${data.publishedArticles}</strong></p>
    `;
    renderArticleList(data.articles || []);
  } catch (error) {
    notify("authorStatus", error.message, true);
  }
}

function renderArticleList(articles) {
  const list = document.getElementById("myArticles");
  if (!articles.length) {
    list.innerHTML = "<li>Пока нет созданных статей.</li>";
    return;
  }

  list.innerHTML = "";
  for (const article of articles) {
    const status = escapeHtml(article.status || "");
    const updatedAt = formatDateTime(article.updatedAt);
    const publishedAt = article.publishedAt ? ` | опубликована: ${formatDateTime(article.publishedAt)}` : "";
    const titleBlock = article.status === "Published"
      ? `<a href="article.html?id=${article.id}" target="_blank" rel="noopener"><strong>${escapeHtml(article.title)}</strong></a>`
      : `<strong>${escapeHtml(article.title)}</strong>`;

    const li = document.createElement("li");
    li.innerHTML = `
      <div class="stack">
        ${titleBlock}
        <div class="muted">${status} | рейтинг: ${Number(article.averageRating).toFixed(2)} (${article.ratingsCount}) | обновлено: ${updatedAt}${publishedAt}</div>
        <div class="stack-inline">
          <button type="button" class="secondary" data-article-action="edit" data-article-id="${article.id}">Редактировать</button>
          <button type="button" class="danger" data-article-action="delete" data-article-id="${article.id}" data-article-title="${escapeHtml(article.title)}">Удалить</button>
        </div>
      </div>
    `;
    list.appendChild(li);
  }
}

async function onArticleListAction(event) {
  const button = event.target.closest("button[data-article-action]");
  if (!button) return;

  const articleId = button.dataset.articleId;
  if (!articleId) return;

  if (button.dataset.articleAction === "edit") {
    await startEditMode(articleId);
    return;
  }

  if (button.dataset.articleAction === "delete") {
    const title = button.dataset.articleTitle || "эту статью";
    const ok = window.confirm(`Удалить «${title}»? Это действие нельзя отменить.`);
    if (!ok) return;

    try {
      await apiRequest(`/api/articles/${articleId}`, { method: "DELETE" });
      if (editingArticleId === articleId) {
        cancelEditMode();
      }
      notify("authorStatus", "Статья удалена.");
      await loadDashboard();
    } catch (error) {
      notify("authorStatus", error.message, true);
    }
  }
}

async function startEditMode(articleId) {
  try {
    const article = await apiRequest(`/api/author/articles/${articleId}`);
    editingArticleId = articleId;

    document.getElementById("articleTitle").value = article.title || "";
    document.getElementById("articleSummary").value = article.summary || "";
    document.getElementById("articleContent").value = article.contentHtml || "";
    document.getElementById("articleCategories").value = Array.isArray(article.categories)
      ? article.categories.join(", ")
      : "";
    document.getElementById("articleKeywords").value = Array.isArray(article.keywords)
      ? article.keywords.join(", ")
      : "";
    document.getElementById("articleStatus").value = article.status || "Published";

    const loadedSteps = loadStepsFromHtml(article.contentHtml || "");
    updateEditorUi();
    notify("authorStatus", loadedSteps
      ? "Режим редактирования включён. Шаги загружены из статьи."
      : "Режим редактирования включён. Для структурирования можно загрузить шаги из HTML.");
    document.getElementById("articleForm").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    notify("authorStatus", error.message, true);
  }
}

function cancelEditMode() {
  editingArticleId = null;
  resetArticleForm();
  updateEditorUi();
  notify("authorStatus", "Редактирование отменено.");
}

async function onSaveArticle(event) {
  event.preventDefault();

  const title = document.getElementById("articleTitle").value.trim();
  const summary = document.getElementById("articleSummary").value.trim();
  const contentHtml = document.getElementById("articleContent").value.trim();
  const categories = splitCommaValues(document.getElementById("articleCategories").value);
  const keywords = splitCommaValues(document.getElementById("articleKeywords").value);
  const status = document.getElementById("articleStatus").value;

  if (!title || !contentHtml) {
    notify("authorStatus", "Заголовок и HTML-контент обязательны.", true);
    return;
  }

  const payload = { title, summary, contentHtml, categories, keywords, status };

  try {
    if (editingArticleId) {
      await apiRequest(`/api/articles/${editingArticleId}`, {
        method: "PUT",
        body: payload
      });
      notify("authorStatus", "Изменения сохранены.");
    } else {
      await apiRequest("/api/articles", {
        method: "POST",
        body: payload
      });
      notify("authorStatus", "Статья сохранена.");
    }

    editingArticleId = null;
    resetArticleForm();
    updateEditorUi();
    await loadDashboard();
  } catch (error) {
    notify("authorStatus", error.message, true);
  }
}

function resetArticleForm() {
  document.getElementById("articleForm").reset();
  articleSteps = [];
  renderStepsPreview();
}

function updateEditorUi() {
  const isEdit = Boolean(editingArticleId);
  document.getElementById("articleEditorTitle").textContent = isEdit ? "Редактировать статью" : "Создать статью";
  document.getElementById("articleEditorHint").hidden = !isEdit;
  document.getElementById("articleSaveBtn").textContent = isEdit ? "Сохранить изменения" : "Сохранить статью";
  document.getElementById("articleCancelBtn").hidden = !isEdit;
}

function splitCommaValues(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

async function onAddStep() {
  const stepTextEl = document.getElementById("stepText");
  const stepAltEl = document.getElementById("stepImageAlt");
  const stepImageEl = document.getElementById("stepImage");

  const text = stepTextEl.value.trim();
  if (!text) {
    notify("authorStatus", "Введите текст шага.", true);
    return;
  }

  let imageUrl = "";
  if (stepImageEl.files && stepImageEl.files[0]) {
    try {
      imageUrl = await fileToDataUrl(stepImageEl.files[0]);
    } catch {
      notify("authorStatus", "Не удалось загрузить картинку шага.", true);
      return;
    }
  }

  articleSteps.push({
    text,
    imageUrl,
    imageAlt: stepAltEl.value.trim()
  });

  syncArticleContentFromSteps();
  renderStepsPreview();
  notify("authorStatus", "Шаг добавлен в шаблон.");

  stepTextEl.value = "";
  stepAltEl.value = "";
  stepImageEl.value = "";
}

function onImportStepsFromContent() {
  const content = document.getElementById("articleContent").value.trim();
  if (!content) {
    notify("authorStatus", "HTML-контент пуст. Сначала добавьте содержимое статьи.", true);
    return;
  }

  const loaded = loadStepsFromHtml(content);
  if (loaded) {
    notify("authorStatus", "Шаги успешно загружены из HTML.");
  } else {
    notify("authorStatus", "Не удалось распознать шаги. Нужен формат с <ol><li>...</li></ol>.", true);
  }
}

function onClearSteps() {
  articleSteps = [];
  syncArticleContentFromSteps();
  renderStepsPreview();
  notify("authorStatus", "Шаблон шагов очищен.");
}

function renderStepsPreview() {
  const preview = document.getElementById("stepsPreview");
  if (!articleSteps.length) {
    preview.innerHTML = "<li>Шаги пока не добавлены.</li>";
    return;
  }

  preview.innerHTML = "";
  articleSteps.forEach((step, index) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <strong>Шаг ${index + 1}</strong>
      <p>${escapeHtml(step.text)}</p>
      ${step.imageUrl ? `<img src="${step.imageUrl}" alt="${escapeHtml(step.imageAlt || step.text)}" class="step-preview-image">` : '<p class="muted">Без картинки</p>'}
      <button type="button" class="secondary step-remove-btn" data-step-remove="${index}">Удалить шаг</button>
    `;
    preview.appendChild(li);
  });
}

function syncArticleContentFromSteps() {
  const contentEl = document.getElementById("articleContent");
  if (!articleSteps.length) {
    contentEl.value = "";
    return;
  }

  const html = articleSteps
    .map((step) => {
      const imagePart = step.imageUrl
        ? `<br><img src="${step.imageUrl}" alt="${escapeHtml(step.imageAlt || step.text)}" style="max-width:100%;height:auto;border-radius:8px;margin-top:8px;">`
        : "";

      return `<li>${escapeHtml(step.text)}${imagePart}</li>`;
    })
    .join("");

  contentEl.value = `<ol>${html}</ol>`;
}

function onDeleteStep(event) {
  const button = event.target.closest("button[data-step-remove]");
  if (!button) return;

  const index = Number(button.dataset.stepRemove);
  if (!Number.isInteger(index) || index < 0 || index >= articleSteps.length) return;

  articleSteps.splice(index, 1);
  syncArticleContentFromSteps();
  renderStepsPreview();
  notify("authorStatus", "Шаг удалён.");
}

function loadStepsFromHtml(contentHtml) {
  const parsedSteps = parseArticleStepsFromHtml(contentHtml);
  if (!parsedSteps.length) {
    articleSteps = [];
    renderStepsPreview();
    return false;
  }

  articleSteps = parsedSteps;
  renderStepsPreview();
  syncArticleContentFromSteps();
  return true;
}

function parseArticleStepsFromHtml(contentHtml) {
  if (!contentHtml || !contentHtml.trim()) {
    return [];
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(contentHtml, "text/html");
  const listItems = Array.from(doc.querySelectorAll("ol > li"));
  if (!listItems.length) {
    return [];
  }

  const steps = [];
  for (const item of listItems) {
    const image = item.querySelector("img");
    const textNode = item.cloneNode(true);
    textNode.querySelectorAll("img").forEach((img) => img.remove());
    const text = String(textNode.textContent || "").replace(/\s+/g, " ").trim();

    if (!text && !image) {
      continue;
    }

    steps.push({
      text: text || "Шаг без текста",
      imageUrl: image ? (image.getAttribute("src") || "") : "",
      imageAlt: image ? (image.getAttribute("alt") || "") : ""
    });
  }

  return steps;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("File read error"));
    reader.readAsDataURL(file);
  });
}

initAuthorPage();
