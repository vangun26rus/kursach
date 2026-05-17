async function initCatalog() {
  const catalog = document.getElementById("catalog");
  catalog.textContent = "Загрузка...";

  try {
    const articles = await apiRequest("/api/articles");
    const grouped = new Map();

    for (const article of articles) {
      const categories = article.categories.length ? article.categories : ["Без категории"];
      for (const name of categories) {
        if (!grouped.has(name)) {
          grouped.set(name, []);
        }
        grouped.get(name).push(article);
      }
    }

    catalog.innerHTML = "";
    if (!grouped.size) {
      catalog.textContent = "Статей пока нет.";
      return;
    }

    const sortedCategories = [...grouped.keys()].sort((a, b) => a.localeCompare(b, "ru"));
    for (const categoryName of sortedCategories) {
      const section = document.createElement("section");
      section.className = "panel";
      section.innerHTML = `<h2>${escapeHtml(categoryName)}</h2>`;

      for (const article of grouped.get(categoryName)) {
        const card = document.createElement("article");
        card.className = "card";
        card.innerHTML = `
          <a href="article.html?id=${article.id}">${escapeHtml(article.title)}</a>
          <p>${escapeHtml(article.summary)}</p>
          <p class="muted">Автор: ${escapeHtml(article.authorName)} | Рейтинг: ${article.averageRating.toFixed(2)} (${article.ratingsCount})</p>
        `;
        section.appendChild(card);
      }

      catalog.appendChild(section);
    }
  } catch (error) {
    catalog.textContent = `Ошибка загрузки каталога: ${error.message}`;
  }
}

initCatalog();
