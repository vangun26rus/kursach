const params = new URLSearchParams(window.location.search);
const articleId = params.get('id');

fetch('data/articles.json')
  .then(response => response.json())
  .then(articles => {
    const article = articles.find(a => a.id === articleId);

    document.getElementById('title').textContent = article.title;

    const stepsList = document.getElementById('steps');
    article.content.forEach(step => {
      const li = document.createElement('li');
      li.textContent = step;
      stepsList.appendChild(li);
    });
  });