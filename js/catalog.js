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
      section.className = "panel catalog-section";
      section.innerHTML = `<h2>${escapeHtml(categoryName)}</h2>`;

      for (const article of grouped.get(categoryName)) {
        const card = document.createElement("article");
        card.className = "card catalog-card";
        const ratingStars = renderRatingStars(article.averageRating);
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
              <span style="color:var(--muted);font-weight:500;font-size:0.9rem;">(${article.ratingsCount})</span>
            </span>
          </p>
        `;
        section.appendChild(card);
      }

      catalog.appendChild(section);
    }
  } catch (error) {
    catalog.textContent = `Ошибка загрузки каталога: ${error.message}`;
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

initCatalog();
