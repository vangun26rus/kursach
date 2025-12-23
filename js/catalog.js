fetch('data/articles.json')
  .then(response => response.json())
  .then(articles => {
    const catalog = document.getElementById('catalog');
    const categories = {};

    articles.forEach(article => {
      if (!categories[article.category]) {
        categories[article.category] = [];
      }
      categories[article.category].push(article);
    });

    for (const category in categories) {
      const h2 = document.createElement('h2');
      h2.textContent = category;
      catalog.appendChild(h2);

      categories[category].forEach(article => {
        const p = document.createElement('p');
        p.innerHTML = `<a href="article.html?id=${article.id}">${article.title}</a>`;
        catalog.appendChild(p);
      });
    }
  });