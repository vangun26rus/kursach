let articles = [];

fetch('data/articles.json')
  .then(response => response.json())
  .then(data => articles = data);

document.getElementById('searchBtn').addEventListener('click', function () {
  const query = document.getElementById('searchInput').value.toLowerCase();
  const resultsList = document.getElementById('results');

  resultsList.innerHTML = '';

  const results = articles.filter(article =>
    article.keywords.some(keyword => query.includes(keyword))
  );

  if (results.length === 0) {
    resultsList.innerHTML = '<li>Ничего не найдено</li>';
    return;
  }

  results.forEach(article => {
    const li = document.createElement('li');
    li.innerHTML = `<a href="article.html?id=${article.id}">${article.title}</a>`;
    resultsList.appendChild(li);
  });
});