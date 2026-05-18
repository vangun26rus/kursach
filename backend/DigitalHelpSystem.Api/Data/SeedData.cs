using DigitalHelpSystem.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace DigitalHelpSystem.Api.Data;

public static class SeedData
{
    private sealed record SeedUser(string Email, string Password, string DisplayName, string Role);
    private sealed record SeedCategory(string Name, string Slug);
    private sealed record SeedArticle(
        string Slug,
        string Title,
        string Summary,
        string ContentHtml,
        string AuthorEmail,
        ArticleStatus Status,
        int DaysAgo,
        IReadOnlyList<string> Categories,
        IReadOnlyList<string> Keywords);
    private sealed record SeedTicket(string Subject, string Description, string CreatedByEmail, TicketStatus Status, bool OpenChat);

    public static async Task InitializeAsync(IServiceProvider serviceProvider)
    {
        var roleManager = serviceProvider.GetRequiredService<RoleManager<AppRole>>();
        var userManager = serviceProvider.GetRequiredService<UserManager<AppUser>>();
        var db = serviceProvider.GetRequiredService<AppDbContext>();

        await EnsureRolesAsync(roleManager);

        var users = new[]
        {
            new SeedUser("admin@digital-help.local", "Admin123!", "System Admin", "Admin"),
            new SeedUser("author@digital-help.local", "Author123!", "Demo Author", "Author"),
            new SeedUser("author2@digital-help.local", "Author234!", "Olga Petrova", "Author"),
            new SeedUser("author3@digital-help.local", "Author345!", "Nikolay Sidorov", "Author"),
            new SeedUser("reader@digital-help.local", "Reader123!", "Demo Reader", "Reader"),
            new SeedUser("reader2@digital-help.local", "Reader234!", "Anna Smirnova", "Reader"),
            new SeedUser("reader3@digital-help.local", "Reader345!", "Sergey Orlov", "Reader"),
            new SeedUser("reader4@digital-help.local", "Reader456!", "Maria Volkova", "Reader")
        };

        var userMap = new Dictionary<string, AppUser>(StringComparer.OrdinalIgnoreCase);
        foreach (var seedUser in users)
        {
            var user = await EnsureUserAsync(userManager, seedUser);
            userMap[seedUser.Email] = user;
            if (seedUser.Role == "Author")
            {
                await EnsureAuthorProfileAsync(db, user, $"Профиль автора {seedUser.DisplayName}");
            }
        }

        var categories = new[]
        {
            new SeedCategory("Почта", "mail"),
            new SeedCategory("Безопасность", "security"),
            new SeedCategory("Госуслуги", "gosuslugi"),
            new SeedCategory("Смартфон", "smartphone"),
            new SeedCategory("Мессенджеры", "messengers"),
            new SeedCategory("Браузер", "browser"),
            new SeedCategory("Файлы", "files"),
            new SeedCategory("Банк", "banking")
        };

        var categoryMap = await EnsureCategoriesAsync(db, categories);

        var articles = new[]
        {
            new SeedArticle(
                "recover-email-access",
                "Как восстановить доступ к почте",
                "Пошаговая инструкция по восстановлению доступа к почтовому аккаунту.",
                "<ol><li>Нажмите «Забыли пароль?» на странице входа.</li><li>Подтвердите личность через телефон или резервный email.</li><li>Создайте новый пароль и сохраните его.</li></ol>",
                "author@digital-help.local",
                ArticleStatus.Published,
                30,
                new[] { "Почта", "Безопасность" },
                new[] { "почта", "пароль", "восстановление" }),
            new SeedArticle(
                "enable-2fa-email",
                "Как включить двухфакторную защиту почты",
                "Усиление безопасности почтового аккаунта через код подтверждения.",
                "<ol><li>Откройте настройки безопасности.</li><li>Выберите «Двухфакторная аутентификация».</li><li>Подключите приложение или SMS-код.</li></ol>",
                "author@digital-help.local",
                ArticleStatus.Published,
                25,
                new[] { "Почта", "Безопасность" },
                new[] { "2fa", "безопасность", "код" }),
            new SeedArticle(
                "gosuslugi-login-help",
                "Не получается войти в Госуслуги",
                "Что проверить, если вход в аккаунт Госуслуг не работает.",
                "<ol><li>Проверьте правильность логина и пароля.</li><li>Убедитесь, что телефон подтверждён.</li><li>Попробуйте вход через банк-партнёр.</li></ol>",
                "author2@digital-help.local",
                ArticleStatus.Published,
                22,
                new[] { "Госуслуги", "Безопасность" },
                new[] { "госуслуги", "вход", "аккаунт" }),
            new SeedArticle(
                "gosuslugi-pension-certificate",
                "Как получить справку о пенсии через Госуслуги",
                "Простой путь к получению электронной справки.",
                "<ol><li>Войдите на портал Госуслуг.</li><li>Откройте раздел «Справки и выписки».</li><li>Выберите услугу и скачайте PDF.</li></ol>",
                "author2@digital-help.local",
                ArticleStatus.Published,
                18,
                new[] { "Госуслуги" },
                new[] { "справка", "пенсия", "pdf" }),
            new SeedArticle(
                "android-font-size",
                "Как увеличить шрифт на Android",
                "Настройка крупного шрифта и контрастности для удобства чтения.",
                "<ol><li>Откройте «Настройки».</li><li>Перейдите в «Экран».</li><li>Увеличьте размер шрифта и масштаб интерфейса.</li></ol>",
                "author3@digital-help.local",
                ArticleStatus.Published,
                16,
                new[] { "Смартфон" },
                new[] { "android", "шрифт", "масштаб" }),
            new SeedArticle(
                "whatsapp-large-text",
                "Как увеличить текст в WhatsApp",
                "Крупный текст и удобное отображение сообщений.",
                "<ol><li>Откройте WhatsApp.</li><li>Зайдите в «Настройки чатов».</li><li>Выберите «Размер шрифта» и установите «Крупный».</li></ol>",
                "author3@digital-help.local",
                ArticleStatus.Published,
                12,
                new[] { "Мессенджеры", "Смартфон" },
                new[] { "whatsapp", "текст", "настройки" }),
            new SeedArticle(
                "browser-zoom-default",
                "Как сделать крупнее страницы в браузере",
                "Постоянный масштаб страниц для комфортного чтения.",
                "<ol><li>Откройте настройки браузера.</li><li>Найдите параметр «Масштаб страницы».</li><li>Установите 120-150%.</li></ol>",
                "author@digital-help.local",
                ArticleStatus.Published,
                10,
                new[] { "Браузер" },
                new[] { "масштаб", "браузер", "чтение" }),
            new SeedArticle(
                "create-strong-password",
                "Как придумать надёжный пароль",
                "Практика безопасных паролей без сложных терминов.",
                "<ol><li>Используйте длинную фразу из 3-4 слов.</li><li>Добавьте цифры и символы.</li><li>Не повторяйте пароли в разных сервисах.</li></ol>",
                "author2@digital-help.local",
                ArticleStatus.Published,
                8,
                new[] { "Безопасность" },
                new[] { "пароль", "безопасность", "аккаунт" }),
            new SeedArticle(
                "phone-storage-cleanup",
                "Как освободить память на телефоне",
                "Удаляем лишние файлы и очищаем кэш без риска.",
                "<ol><li>Проверьте раздел «Хранилище».</li><li>Удалите большие ненужные файлы и видео.</li><li>Очистите кэш приложений.</li></ol>",
                "author3@digital-help.local",
                ArticleStatus.Published,
                6,
                new[] { "Смартфон", "Файлы" },
                new[] { "память", "кэш", "файлы" }),
            new SeedArticle(
                "bank-app-card-block",
                "Как заблокировать карту в банковском приложении",
                "Что делать, если карта потерялась.",
                "<ol><li>Откройте приложение банка.</li><li>Выберите карту и нажмите «Заблокировать».</li><li>Закажите перевыпуск карты.</li></ol>",
                "author@digital-help.local",
                ArticleStatus.Published,
                4,
                new[] { "Банк", "Безопасность" },
                new[] { "карта", "банк", "блокировка" }),
            new SeedArticle(
                "messenger-scam-check",
                "Как распознать мошенников в мессенджере",
                "Признаки опасных сообщений и как на них реагировать.",
                "<ol><li>Проверяйте незнакомые ссылки.</li><li>Не сообщайте коды подтверждения.</li><li>Жалуйтесь на подозрительные аккаунты.</li></ol>",
                "author2@digital-help.local",
                ArticleStatus.Published,
                3,
                new[] { "Мессенджеры", "Безопасность" },
                new[] { "мошенники", "фишинг", "ссылки" }),
            new SeedArticle(
                "draft-cloud-backup",
                "Черновик: резервное копирование файлов",
                "Как настроить облачное копирование важных документов.",
                "<p>Черновик статьи в работе.</p>",
                "author3@digital-help.local",
                ArticleStatus.Draft,
                2,
                new[] { "Файлы" },
                new[] { "резервная копия", "облако" }),
            new SeedArticle(
                "archived-old-browser",
                "Архив: старые версии браузера",
                "Устаревшая инструкция оставлена в архиве.",
                "<p>Материал снят с публикации.</p>",
                "author@digital-help.local",
                ArticleStatus.Archived,
                1,
                new[] { "Браузер" },
                new[] { "архив", "браузер" })
        };

        var articleMap = await EnsureArticlesAsync(db, articles, userMap, categoryMap);
        await db.SaveChangesAsync();

        await SeedRatingsAndCommentsAsync(db, articleMap, userMap);
        await SeedSupportDataAsync(db, userMap);
        await UpdateAllAuthorProfilesAsync(db);
        await db.SaveChangesAsync();
    }

    private static async Task EnsureRolesAsync(RoleManager<AppRole> roleManager)
    {
        var roles = new[] { "Reader", "Author", "Admin" };
        foreach (var roleName in roles)
        {
            if (!await roleManager.Roles.AnyAsync(r => r.Name == roleName))
            {
                await roleManager.CreateAsync(new AppRole { Name = roleName, NormalizedName = roleName.ToUpperInvariant() });
            }
        }
    }

    private static async Task<AppUser> EnsureUserAsync(UserManager<AppUser> userManager, SeedUser seedUser)
    {
        var user = await userManager.FindByEmailAsync(seedUser.Email);
        if (user is null)
        {
            user = new AppUser
            {
                UserName = seedUser.Email,
                Email = seedUser.Email,
                DisplayName = seedUser.DisplayName,
                EmailConfirmed = true
            };

            var createResult = await userManager.CreateAsync(user, seedUser.Password);
            if (!createResult.Succeeded)
            {
                throw new InvalidOperationException($"Cannot create seed user {seedUser.Email}: {string.Join(", ", createResult.Errors.Select(e => e.Description))}");
            }
        }
        else
        {
            user.DisplayName = seedUser.DisplayName;
            user.EmailConfirmed = true;
            await userManager.UpdateAsync(user);
        }

        // Для админа добавляем обе роли: Admin и Author
        var rolesToAdd = new List<string>();
        if (seedUser.Email.Equals("admin@digital-help.local", StringComparison.OrdinalIgnoreCase))
        {
            rolesToAdd.Add("Admin");
            rolesToAdd.Add("Author");
        }
        else
        {
            rolesToAdd.Add(seedUser.Role);
        }

        var currentRoles = await userManager.GetRolesAsync(user);
        
        // Удаляем все текущие роли
        if (currentRoles.Count > 0)
        {
            await userManager.RemoveFromRolesAsync(user, currentRoles);
        }
        
        // Добавляем нужные роли
        foreach (var role in rolesToAdd)
        {
            await userManager.AddToRoleAsync(user, role);
        }

        return user;
    }

    private static async Task EnsureAuthorProfileAsync(AppDbContext db, AppUser author, string bio)
    {
        var profile = await db.AuthorProfiles.FirstOrDefaultAsync(p => p.UserId == author.Id);
        if (profile is null)
        {
            db.AuthorProfiles.Add(new AuthorProfile
            {
                UserId = author.Id,
                Bio = bio,
                AverageRating = 0,
                ArticlesPublished = 0
            });
            return;
        }

        if (string.IsNullOrWhiteSpace(profile.Bio))
        {
            profile.Bio = bio;
        }
    }

    private static async Task<Dictionary<string, Category>> EnsureCategoriesAsync(AppDbContext db, IEnumerable<SeedCategory> categories)
    {
        var map = new Dictionary<string, Category>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in categories)
        {
            var category = await db.Categories.FirstOrDefaultAsync(c => c.Name == item.Name);
            if (category is null)
            {
                category = new Category
                {
                    Id = Guid.NewGuid(),
                    Name = item.Name,
                    Slug = item.Slug
                };
                db.Categories.Add(category);
            }
            map[item.Name] = category;
        }
        return map;
    }

    private static async Task<Dictionary<string, Article>> EnsureArticlesAsync(
        AppDbContext db,
        IEnumerable<SeedArticle> articles,
        IReadOnlyDictionary<string, AppUser> userMap,
        IReadOnlyDictionary<string, Category> categoryMap)
    {
        var result = new Dictionary<string, Article>(StringComparer.OrdinalIgnoreCase);

        foreach (var item in articles)
        {
            var article = await db.Articles.FirstOrDefaultAsync(a => a.Slug == item.Slug);

            if (!userMap.TryGetValue(item.AuthorEmail, out var author))
            {
                throw new InvalidOperationException($"Unknown article author: {item.AuthorEmail}");
            }

            DateTime? publishedAt = item.Status == ArticleStatus.Published
                ? DateTime.UtcNow.AddDays(-Math.Abs(item.DaysAgo))
                : null;
            var createdAt = DateTime.UtcNow.AddDays(-Math.Abs(item.DaysAgo) - 2);
            var updatedAt = DateTime.UtcNow.AddDays(-Math.Abs(item.DaysAgo));

            if (article is null)
            {
                article = new Article
                {
                    Id = Guid.NewGuid(),
                    AuthorId = author.Id,
                    Title = item.Title,
                    Slug = item.Slug,
                    Summary = item.Summary,
                    ContentHtml = item.ContentHtml,
                    Status = item.Status,
                    PublishedAt = publishedAt,
                    CreatedAt = createdAt,
                    UpdatedAt = updatedAt
                };
                db.Articles.Add(article);
            }
            else
            {
                article.AuthorId = author.Id;
                article.Title = item.Title;
                article.Summary = item.Summary;
                article.ContentHtml = item.ContentHtml;
                article.Status = item.Status;
                article.PublishedAt = publishedAt;
                article.UpdatedAt = updatedAt;

                await db.ArticleCategories
                    .Where(ac => ac.ArticleId == article.Id)
                    .ExecuteDeleteAsync();
                await db.ArticleKeywords
                    .Where(k => k.ArticleId == article.Id)
                    .ExecuteDeleteAsync();
            }

            foreach (var categoryName in item.Categories.Distinct(StringComparer.OrdinalIgnoreCase))
            {
                if (!categoryMap.TryGetValue(categoryName, out var category))
                {
                    continue;
                }

                db.ArticleCategories.Add(new ArticleCategory
                {
                    ArticleId = article.Id,
                    CategoryId = category.Id
                });
            }

            foreach (var keyword in item.Keywords.Distinct(StringComparer.OrdinalIgnoreCase))
            {
                db.ArticleKeywords.Add(new ArticleKeyword
                {
                    Id = Guid.NewGuid(),
                    ArticleId = article.Id,
                    Value = keyword
                });
            }

            result[item.Slug] = article;
        }

        return result;
    }

    private static async Task SeedRatingsAndCommentsAsync(
        AppDbContext db,
        IReadOnlyDictionary<string, Article> articleMap,
        IReadOnlyDictionary<string, AppUser> userMap)
    {
        async Task UpsertRatingAsync(string articleSlug, string userEmail, byte score)
        {
            var article = articleMap[articleSlug];
            var user = userMap[userEmail];
            var existing = await db.Ratings.FirstOrDefaultAsync(r => r.ArticleId == article.Id && r.UserId == user.Id);
            if (existing is null)
            {
                db.Ratings.Add(new Rating
                {
                    Id = Guid.NewGuid(),
                    ArticleId = article.Id,
                    UserId = user.Id,
                    Score = score,
                    CreatedAt = DateTime.UtcNow.AddDays(-1)
                });
            }
            else
            {
                existing.Score = score;
            }
        }

        async Task UpsertCommentAsync(string articleSlug, string userEmail, string text, int daysAgo)
        {
            var article = articleMap[articleSlug];
            var user = userMap[userEmail];
            var exists = await db.Comments.AnyAsync(c => c.ArticleId == article.Id && c.UserId == user.Id && c.Text == text);
            if (exists) return;

            db.Comments.Add(new Comment
            {
                Id = Guid.NewGuid(),
                ArticleId = article.Id,
                UserId = user.Id,
                Text = text,
                CreatedAt = DateTime.UtcNow.AddDays(-Math.Abs(daysAgo))
            });
        }

        await UpsertRatingAsync("recover-email-access", "reader@digital-help.local", 5);
        await UpsertRatingAsync("recover-email-access", "reader2@digital-help.local", 4);
        await UpsertRatingAsync("recover-email-access", "reader3@digital-help.local", 5);
        await UpsertRatingAsync("enable-2fa-email", "reader@digital-help.local", 5);
        await UpsertRatingAsync("enable-2fa-email", "reader4@digital-help.local", 5);
        await UpsertRatingAsync("browser-zoom-default", "reader2@digital-help.local", 4);
        await UpsertRatingAsync("bank-app-card-block", "reader3@digital-help.local", 4);

        await UpsertRatingAsync("gosuslugi-login-help", "reader@digital-help.local", 4);
        await UpsertRatingAsync("gosuslugi-login-help", "reader2@digital-help.local", 3);
        await UpsertRatingAsync("gosuslugi-pension-certificate", "reader3@digital-help.local", 4);
        await UpsertRatingAsync("create-strong-password", "reader4@digital-help.local", 3);
        await UpsertRatingAsync("messenger-scam-check", "reader2@digital-help.local", 4);

        await UpsertRatingAsync("android-font-size", "reader@digital-help.local", 2);
        await UpsertRatingAsync("android-font-size", "reader2@digital-help.local", 3);
        await UpsertRatingAsync("whatsapp-large-text", "reader3@digital-help.local", 2);
        await UpsertRatingAsync("phone-storage-cleanup", "reader4@digital-help.local", 3);

        await UpsertCommentAsync("recover-email-access", "reader@digital-help.local", "Очень помогло, восстановил доступ за 10 минут.", 20);
        await UpsertCommentAsync("recover-email-access", "reader2@digital-help.local", "Добавьте шаг про резервный телефон.", 18);
        await UpsertCommentAsync("gosuslugi-login-help", "reader3@digital-help.local", "Сработал вход через банк, спасибо.", 14);
        await UpsertCommentAsync("android-font-size", "reader4@digital-help.local", "Нашёл не сразу нужный пункт в меню, но в целом полезно.", 10);
        await UpsertCommentAsync("bank-app-card-block", "reader2@digital-help.local", "Инструкция чёткая и короткая.", 4);
    }

    private static async Task SeedSupportDataAsync(AppDbContext db, IReadOnlyDictionary<string, AppUser> userMap)
    {
        // Recreate all demo tickets from scratch to avoid stale legacy messages.
        var demoTicketIds = await db.FeedbackTickets
            .Where(t => t.Subject.StartsWith("DEMO:"))
            .Select(t => t.Id)
            .ToListAsync();
        if (demoTicketIds.Count > 0)
        {
            await db.ChatMessages
                .Where(m => db.ChatRooms.Where(r => demoTicketIds.Contains(r.TicketId)).Select(r => r.Id).Contains(m.RoomId))
                .ExecuteDeleteAsync();
            await db.ChatRooms
                .Where(r => demoTicketIds.Contains(r.TicketId))
                .ExecuteDeleteAsync();
            await db.TicketMessages
                .Where(m => demoTicketIds.Contains(m.TicketId))
                .ExecuteDeleteAsync();
            await db.FeedbackTickets
                .Where(t => demoTicketIds.Contains(t.Id))
                .ExecuteDeleteAsync();
        }

        var tickets = new[]
        {
            new SeedTicket(
                "DEMO: Нужна быстрая помощь по статье",
                "Статья не помогла, нужен специалист в чате.",
                "reader@digital-help.local",
                TicketStatus.InProgress,
                true),
            new SeedTicket(
                "DEMO: Нужна консультация по настройке телефона",
                "Не получается повторить шаги из инструкции, нужен чат.",
                "reader2@digital-help.local",
                TicketStatus.Open,
                true),
            new SeedTicket(
                "DEMO: Техническая ошибка при отправке комментария",
                "После нажатия кнопки отправки появляется сообщение о сбое.",
                "reader3@digital-help.local",
                TicketStatus.Resolved,
                false),
            new SeedTicket(
                "DEMO: Техническая ошибка в рейтинге автора",
                "Рейтинг автора не меняется после новых оценок.",
                "reader4@digital-help.local",
                TicketStatus.Closed,
                false)
        };

        var adminId = userMap["admin@digital-help.local"].Id;
        var staffId = userMap["author2@digital-help.local"].Id;

        foreach (var item in tickets)
        {
            var existing = await db.FeedbackTickets
                .Include(t => t.ChatRoom)
                .FirstOrDefaultAsync(t => t.Subject == item.Subject);

            if (!userMap.TryGetValue(item.CreatedByEmail, out var createdBy))
            {
                continue;
            }

            FeedbackTicket ticket;
            if (existing is null)
            {
                ticket = new FeedbackTicket
                {
                    Id = Guid.NewGuid(),
                    CreatedByUserId = createdBy.Id,
                    Subject = item.Subject,
                    Description = item.Description,
                    Status = item.Status,
                    CreatedAt = DateTime.UtcNow.AddDays(-7),
                    UpdatedAt = DateTime.UtcNow.AddDays(-1)
                };
                db.FeedbackTickets.Add(ticket);

                db.TicketMessages.Add(new TicketMessage
                {
                    Id = Guid.NewGuid(),
                    TicketId = ticket.Id,
                    SenderUserId = createdBy.Id,
                    Message = item.Description,
                    CreatedAt = DateTime.UtcNow.AddDays(-7)
                });
                db.TicketMessages.Add(new TicketMessage
                {
                    Id = Guid.NewGuid(),
                    TicketId = ticket.Id,
                    SenderUserId = adminId,
                    Message = "Спасибо за обращение, мы уже проверяем проблему.",
                    CreatedAt = DateTime.UtcNow.AddDays(-6)
                });
                if (item.OpenChat)
                {
                    db.TicketMessages.Add(new TicketMessage
                    {
                        Id = Guid.NewGuid(),
                        TicketId = ticket.Id,
                        SenderUserId = staffId,
                        Message = "Подключаюсь к чату и помогаю по шагам.",
                        CreatedAt = DateTime.UtcNow.AddDays(-5)
                    });
                }
            }
            else
            {
                ticket = existing;
                ticket.Status = item.Status;
                ticket.UpdatedAt = DateTime.UtcNow.AddDays(-1);
            }

            if (!item.OpenChat)
            {
                var authorMessages = await db.TicketMessages
                    .Where(m => m.TicketId == ticket.Id && m.SenderUserId == staffId)
                    .ToListAsync();
                if (authorMessages.Count > 0)
                {
                    db.TicketMessages.RemoveRange(authorMessages);
                }
            }

            if (item.OpenChat && ticket.ChatRoom is null)
            {
                var room = new ChatRoom
                {
                    Id = Guid.NewGuid(),
                    TicketId = ticket.Id,
                    CreatedAt = DateTime.UtcNow.AddDays(-6),
                    IsClosed = ticket.Status is TicketStatus.Resolved or TicketStatus.Closed
                };
                db.ChatRooms.Add(room);

                db.ChatMessages.Add(new ChatMessage
                {
                    Id = Guid.NewGuid(),
                    RoomId = room.Id,
                    SenderUserId = createdBy.Id,
                    Message = "Здравствуйте, не получается решить проблему по инструкции.",
                    SentAt = DateTime.UtcNow.AddDays(-6)
                });
                db.ChatMessages.Add(new ChatMessage
                {
                    Id = Guid.NewGuid(),
                    RoomId = room.Id,
                    SenderUserId = staffId,
                    Message = "Здравствуйте, давайте разберёмся вместе. Опишите, на каком шаге остановились.",
                    SentAt = DateTime.UtcNow.AddDays(-6).AddMinutes(15)
                });
            }

            if (!item.OpenChat && ticket.ChatRoom is not null)
            {
                var roomId = ticket.ChatRoom.Id;
                await db.ChatMessages.Where(m => m.RoomId == roomId).ExecuteDeleteAsync();
                db.ChatRooms.Remove(ticket.ChatRoom);
            }
        }
    }

    private static async Task UpdateAllAuthorProfilesAsync(AppDbContext db)
    {
        var authorIds = await db.AuthorProfiles.Select(p => p.UserId).ToListAsync();
        foreach (var authorId in authorIds)
        {
            var avg = await db.Ratings
                .Where(r => r.Article.AuthorId == authorId && r.Article.Status == ArticleStatus.Published)
                .AverageAsync(r => (double?)r.Score) ?? 0;

            var publishedCount = await db.Articles
                .Where(a => a.AuthorId == authorId && a.Status == ArticleStatus.Published)
                .CountAsync();

            var profile = await db.AuthorProfiles.FirstAsync(p => p.UserId == authorId);
            profile.AverageRating = Math.Round((decimal)avg, 2);
            profile.ArticlesPublished = publishedCount;
        }
    }
}
