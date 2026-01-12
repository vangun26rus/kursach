const params = new URLSearchParams(window.location.search);
const articleId = params.get('id');

fetch('data/articles.json')
  .then(response => response.json())
  .then(articles => {
    const article = articles.find(a => a.id === articleId);
    if (!article) {
      document.getElementById('title').textContent = 'Инструкция не найдена';
      return;
    }

    document.getElementById('title').textContent = article.title;
    const stepsList = document.getElementById('steps');
    stepsList.innerHTML = '';

    article.content.forEach((stepText, index) => {
      const li = document.createElement('li');

      // Текст шага
      const textEl = document.createElement('p');
      textEl.textContent = stepText;
      li.appendChild(textEl);

      // Попытка добавить изображение
      const img = document.createElement('img');
      const imagePath = `images/${articleId}-step${index + 1}.png`;
      img.src = imagePath;
      img.alt = `Иллюстрация к шагу ${index + 1}`;
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      img.style.borderRadius = '8px';
      img.style.marginTop = '10px';
      img.style.display = 'none'; // Скрываем до успешной загрузки

      // Если изображение загрузилось — показываем
      img.onload = () => {
        img.style.display = 'block';
      };

      // Если ошибка — ничего не делаем (остаётся скрытым)
      img.onerror = () => {
        // Можно ничего не делать — изображение не появится
      };

      li.appendChild(img);
      stepsList.appendChild(li);
    });
  })
  .catch(err => {
    console.error('Ошибка загрузки статьи:', err);
    document.getElementById('title').textContent = 'Не удалось загрузить инструкцию';
  });