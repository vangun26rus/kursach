using DigitalHelpSystem.Api.Data;
using DigitalHelpSystem.Api.Infrastructure;
using DigitalHelpSystem.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text;

namespace DigitalHelpSystem.Api.Controllers;

[ApiController]
[Route("api/articles")]
public class ArticlesController : ControllerBase
{
    private readonly AppDbContext _db;

    public ArticlesController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    [AllowAnonymous]
    public async Task<ActionResult<IReadOnlyList<ArticleSummaryDto>>> List([FromQuery] string? search, [FromQuery] string? category)
    {
        var query = _db.Articles
            .AsNoTracking()
            .Include(a => a.Author)
            .Include(a => a.ArticleCategories)
                .ThenInclude(ac => ac.Category)
            .Include(a => a.Keywords)
            .Include(a => a.Ratings)
            .Where(a => a.Status == ArticleStatus.Published);

        var articles = await query
            .OrderByDescending(a => a.PublishedAt)
            .ToListAsync();

        IEnumerable<Article> filtered = articles;

        if (!string.IsNullOrWhiteSpace(category))
        {
            var normalizedCategory = NormalizeText(category);
            filtered = filtered.Where(a => a.ArticleCategories.Any(ac =>
                NormalizeText(ac.Category.Slug) == normalizedCategory ||
                NormalizeText(ac.Category.Name) == normalizedCategory));
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            filtered = filtered.Where(a => MatchesSearch(a, search));
        }

        var items = filtered
            .Select(a => new ArticleSummaryDto(
                a.Id,
                a.Slug,
                a.Title,
                a.Summary,
                a.Author.DisplayName,
                a.ArticleCategories.Select(ac => ac.Category.Name).ToArray(),
                a.Ratings.Count == 0 ? 0 : Math.Round(a.Ratings.Average(r => (double)r.Score), 2),
                a.Ratings.Count,
                a.PublishedAt))
            .ToList();

        return Ok(items);
    }

    [HttpGet("{idOrSlug}")]
    [AllowAnonymous]
    public async Task<ActionResult<ArticleDetailDto>> GetByIdOrSlug(string idOrSlug)
    {
        var article = await FindArticleByIdOrSlugAsync(idOrSlug);
        if (article is null || article.Status != ArticleStatus.Published)
        {
            return NotFound();
        }

        var authorRating = await _db.AuthorProfiles
            .Where(p => p.UserId == article.AuthorId)
            .Select(p => p.AverageRating)
            .FirstOrDefaultAsync();

        var currentUserId = User?.Identity?.IsAuthenticated == true ? User.GetUserId() : Guid.Empty;
        var isFavorite = false;
        if (User?.Identity?.IsAuthenticated == true)
        {
            var userId = User.GetUserId();
            isFavorite = await _db.UserFavorites.AnyAsync(f => f.UserId == userId && f.ArticleId == article.Id);
            await RecordArticleViewAsync(article.Id, userId);
        }

        var dto = new ArticleDetailDto(
            article.Id,
            article.Slug,
            article.Title,
            article.Summary,
            article.ContentHtml,
            article.Author.DisplayName,
            article.AuthorId,
            article.ArticleCategories.Select(ac => ac.Category.Name).ToArray(),
            article.Keywords.Select(k => k.Value).ToArray(),
            article.Ratings.Count == 0 ? 0 : Math.Round(article.Ratings.Average(r => (double)r.Score), 2),
            article.Ratings.Count,
            authorRating,
            article.Comments
                .Where(c => !c.IsDeleted)
                .OrderByDescending(c => c.CreatedAt)
                .Select(c => new CommentDto(c.Id, c.User.DisplayName, c.Text, c.CreatedAt, c.UserId == currentUserId))
                .ToArray(),
            article.PublishedAt,
            isFavorite);

        return Ok(dto);
    }

    [HttpGet("{id:guid}/similar")]
    [AllowAnonymous]
    public async Task<ActionResult<IReadOnlyList<ArticleSummaryDto>>> Similar(Guid id)
    {
        var article = await _db.Articles
            .AsNoTracking()
            .Include(a => a.ArticleCategories)
            .Include(a => a.Keywords)
            .FirstOrDefaultAsync(a => a.Id == id && a.Status == ArticleStatus.Published);

        if (article is null)
        {
            return NotFound();
        }

        var categoryIds = article.ArticleCategories.Select(c => c.CategoryId).ToArray();
        var keywords = article.Keywords.Select(k => k.Value.ToLower()).ToArray();

        var similar = await _db.Articles
            .AsNoTracking()
            .Include(a => a.Author)
            .Include(a => a.ArticleCategories).ThenInclude(ac => ac.Category)
            .Include(a => a.Keywords)
            .Include(a => a.Ratings)
            .Where(a => a.Id != id && a.Status == ArticleStatus.Published)
            .Select(a => new
            {
                Article = a,
                Score =
                    a.ArticleCategories.Count(ac => categoryIds.Contains(ac.CategoryId)) * 5 +
                    a.Keywords.Count(k => keywords.Contains(k.Value.ToLower()))
            })
            .Where(x => x.Score > 0)
            .OrderByDescending(x => x.Score)
            .ThenByDescending(x => x.Article.PublishedAt)
            .Take(5)
            .Select(x => new ArticleSummaryDto(
                x.Article.Id,
                x.Article.Slug,
                x.Article.Title,
                x.Article.Summary,
                x.Article.Author.DisplayName,
                x.Article.ArticleCategories.Select(ac => ac.Category.Name).ToArray(),
                x.Article.Ratings.Count == 0 ? 0 : Math.Round(x.Article.Ratings.Average(r => (double)r.Score), 2),
                x.Article.Ratings.Count,
                x.Article.PublishedAt))
            .ToListAsync();

        return Ok(similar);
    }

    [HttpPost]
    [Authorize(Policy = "AuthorOrAdmin")]
    public async Task<ActionResult<ArticleSummaryDto>> Create([FromBody] UpsertArticleRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Title) || string.IsNullOrWhiteSpace(request.ContentHtml))
        {
            return BadRequest(new { message = "Title and content are required." });
        }

        var userId = User.GetUserId();
        var article = new Article
        {
            Id = Guid.NewGuid(),
            AuthorId = userId,
            Title = request.Title.Trim(),
            Summary = request.Summary?.Trim() ?? string.Empty,
            ContentHtml = request.ContentHtml,
            Status = NormalizeStatus(request.Status),
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        article.Slug = await BuildUniqueSlugAsync(article.Title);
        if (article.Status == ArticleStatus.Published)
        {
            article.PublishedAt = DateTime.UtcNow;
        }

        _db.Articles.Add(article);
        await SyncCategoriesAsync(article, request.Categories);
        await SyncKeywordsAsync(article, request.Keywords);
        await _db.SaveChangesAsync();
        await UpdateAuthorProfileRatingAsync(article.AuthorId);

        return CreatedAtAction(nameof(GetByIdOrSlug), new { idOrSlug = article.Slug }, new ArticleSummaryDto(
            article.Id,
            article.Slug,
            article.Title,
            article.Summary,
            User.Identity?.Name ?? "Author",
            request.Categories ?? Array.Empty<string>(),
            0,
            0,
            article.PublishedAt));
    }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "AuthorOrAdmin")]
    public async Task<ActionResult> Update(Guid id, [FromBody] UpsertArticleRequest request)
    {
        var article = await _db.Articles
            .Include(a => a.ArticleCategories)
            .Include(a => a.Keywords)
            .FirstOrDefaultAsync(a => a.Id == id);
        if (article is null)
        {
            return NotFound();
        }

        var userId = User.GetUserId();
        var isAdmin = User.IsInRole("Admin");
        if (!isAdmin && article.AuthorId != userId)
        {
            return Forbid();
        }

        article.Title = request.Title?.Trim() ?? article.Title;
        article.Summary = request.Summary?.Trim() ?? article.Summary;
        article.ContentHtml = request.ContentHtml ?? article.ContentHtml;
        article.UpdatedAt = DateTime.UtcNow;

        var newStatus = NormalizeStatus(request.Status);
        if (article.Status != ArticleStatus.Published && newStatus == ArticleStatus.Published)
        {
            article.PublishedAt = DateTime.UtcNow;
        }
        article.Status = newStatus;

        if (!string.IsNullOrWhiteSpace(request.Title))
        {
            article.Slug = await BuildUniqueSlugAsync(article.Title, article.Id);
        }

        if (request.Categories is not null)
        {
            await SyncCategoriesAsync(article, request.Categories);
        }

        if (request.Keywords is not null)
        {
            await SyncKeywordsAsync(article, request.Keywords);
        }

        await _db.SaveChangesAsync();
        await UpdateAuthorProfileRatingAsync(article.AuthorId);
        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "AuthorOrAdmin")]
    public async Task<ActionResult> Delete(Guid id)
    {
        var article = await _db.Articles
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == id);
        if (article is null)
        {
            return NotFound();
        }

        var userId = User.GetUserId();
        var isAdmin = User.IsInRole("Admin");
        if (!isAdmin && article.AuthorId != userId)
        {
            return Forbid();
        }

        await _db.Comments.Where(c => c.ArticleId == id).ExecuteDeleteAsync();
        await _db.Ratings.Where(r => r.ArticleId == id).ExecuteDeleteAsync();
        await _db.ArticleKeywords.Where(k => k.ArticleId == id).ExecuteDeleteAsync();
        await _db.ArticleCategories.Where(ac => ac.ArticleId == id).ExecuteDeleteAsync();
        await _db.Articles.Where(a => a.Id == id).ExecuteDeleteAsync();

        await UpdateAuthorProfileRatingAsync(article.AuthorId);
        return NoContent();
    }

    [HttpPost("{id:guid}/rating")]
    [Authorize(Roles = "Reader,Author,Admin")]
    public async Task<ActionResult> Rate(Guid id, [FromBody] RateArticleRequest request)
    {
        if (request.Score < 1 || request.Score > 5)
        {
            return BadRequest(new { message = "Score must be between 1 and 5." });
        }

        var article = await _db.Articles.FirstOrDefaultAsync(a => a.Id == id && a.Status == ArticleStatus.Published);
        if (article is null)
        {
            return NotFound();
        }

        var userId = User.GetUserId();
        var existing = await _db.Ratings.FirstOrDefaultAsync(r => r.ArticleId == id && r.UserId == userId);
        if (existing is null)
        {
            _db.Ratings.Add(new Rating
            {
                Id = Guid.NewGuid(),
                ArticleId = id,
                UserId = userId,
                Score = request.Score,
                CreatedAt = DateTime.UtcNow
            });
        }
        else
        {
            existing.Score = request.Score;
            existing.CreatedAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync();
        await UpdateAuthorProfileRatingAsync(article.AuthorId);
        return NoContent();
    }

    [HttpPost("{id:guid}/comments")]
    [Authorize(Roles = "Reader,Author,Admin")]
    public async Task<ActionResult<CommentDto>> AddComment(Guid id, [FromBody] AddCommentRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Text))
        {
            return BadRequest(new { message = "Comment text is required." });
        }

        var article = await _db.Articles.FirstOrDefaultAsync(a => a.Id == id && a.Status == ArticleStatus.Published);
        if (article is null)
        {
            return NotFound();
        }

        var userId = User.GetUserId();
        var comment = new Comment
        {
            Id = Guid.NewGuid(),
            ArticleId = id,
            UserId = userId,
            Text = request.Text.Trim(),
            CreatedAt = DateTime.UtcNow
        };

        _db.Comments.Add(comment);
        await _db.SaveChangesAsync();

        var userName = await _db.Users.Where(u => u.Id == userId).Select(u => u.DisplayName).FirstAsync();
        return Ok(new CommentDto(comment.Id, userName, comment.Text, comment.CreatedAt, true));
    }

    [HttpDelete("{id:guid}/comments/{commentId:guid}")]
    [Authorize(Roles = "Reader,Author,Admin")]
    public async Task<ActionResult> DeleteComment(Guid id, Guid commentId)
    {
        var comment = await _db.Comments.FirstOrDefaultAsync(c => c.Id == commentId && c.ArticleId == id && !c.IsDeleted);
        if (comment is null)
        {
            return NotFound();
        }

        var userId = User.GetUserId();
        if (comment.UserId != userId)
        {
            return Forbid();
        }

        comment.IsDeleted = true;
        await _db.SaveChangesAsync();

        return NoContent();
    }

    private async Task<Article?> FindArticleByIdOrSlugAsync(string idOrSlug)
    {
        var query = _db.Articles
            .AsNoTracking()
            .Include(a => a.Author)
            .Include(a => a.ArticleCategories).ThenInclude(ac => ac.Category)
            .Include(a => a.Keywords)
            .Include(a => a.Ratings)
            .Include(a => a.Comments).ThenInclude(c => c.User);

        if (Guid.TryParse(idOrSlug, out var id))
        {
            return await query.FirstOrDefaultAsync(a => a.Id == id);
        }

        return await query.FirstOrDefaultAsync(a => a.Slug == idOrSlug);
    }

    private async Task RecordArticleViewAsync(Guid articleId, Guid userId)
    {
        var existing = await _db.ViewedArticles.FirstOrDefaultAsync(v => v.UserId == userId && v.ArticleId == articleId);
        if (existing is null)
        {
            _db.ViewedArticles.Add(new ViewedArticle
            {
                UserId = userId,
                ArticleId = articleId,
                ViewedAt = DateTime.UtcNow
            });
        }
        else
        {
            existing.ViewedAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync();
        await PruneOldHistoryEntriesAsync(userId);
    }

    private async Task PruneOldHistoryEntriesAsync(Guid userId)
    {
        var total = await _db.ViewedArticles.CountAsync(v => v.UserId == userId);
        if (total <= 50)
        {
            return;
        }

        var extra = await _db.ViewedArticles
            .Where(v => v.UserId == userId)
            .OrderByDescending(v => v.ViewedAt)
            .Skip(50)
            .ToListAsync();

        if (extra.Count > 0)
        {
            _db.ViewedArticles.RemoveRange(extra);
            await _db.SaveChangesAsync();
        }
    }

    private static ArticleStatus NormalizeStatus(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return ArticleStatus.Published;
        }

        return value.Trim().ToLowerInvariant() switch
        {
            "draft" => ArticleStatus.Draft,
            "published" => ArticleStatus.Published,
            "archived" => ArticleStatus.Archived,
            _ => ArticleStatus.Published
        };
    }

    private static bool MatchesSearch(Article article, string search)
    {
        var queryTokens = Tokenize(search);
        if (queryTokens.Count == 0)
        {
            return true;
        }

        var articleSource = string.Join(' ', new[]
        {
            article.Title,
            article.Summary,
            string.Join(' ', article.Keywords.Select(k => k.Value)),
            string.Join(' ', article.ArticleCategories.Select(c => c.Category.Name))
        });

        var articleTokens = Tokenize(articleSource)
            .SelectMany(GetTokenForms)
            .Distinct(StringComparer.Ordinal)
            .ToArray();

        foreach (var queryToken in queryTokens)
        {
            var queryForms = GetQueryForms(queryToken);
            var matched = queryForms.Any(q => articleTokens.Any(a => IsMatch(a, q)));
            if (!matched)
            {
                return false;
            }
        }

        return true;
    }

    private static IEnumerable<string> GetTokenForms(string token)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            yield break;
        }

        var normalized = NormalizeText(token);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            yield break;
        }

        yield return normalized;
        yield return StemRussian(normalized);
    }

    private static IReadOnlyList<string> GetQueryForms(string token)
    {
        var forms = new HashSet<string>(StringComparer.Ordinal);
        void Add(string value)
        {
            var normalized = NormalizeText(value);
            if (!string.IsNullOrWhiteSpace(normalized))
            {
                forms.Add(normalized);
                forms.Add(StemRussian(normalized));
            }
        }

        Add(token);
        Add(ConvertKeyboardLayout(token, enToRu: true));
        Add(ConvertKeyboardLayout(token, enToRu: false));
        Add(TransliterateLatinToCyrillic(token));

        foreach (var synonym in GetSynonyms(token))
        {
            Add(synonym);
        }

        return forms.ToArray();
    }

    private static IEnumerable<string> GetSynonyms(string token)
    {
        var normalized = NormalizeText(token);
        if (normalized is "wifi" or "wi fi" or "вайфай" or "вай фай")
        {
            return new[] { "wifi", "wi-fi", "вайфай", "вай фай" };
        }

        if (normalized is "email" or "e mail" or "имейл" or "емайл")
        {
            return new[] { "email", "e-mail", "почта", "имейл" };
        }

        return Array.Empty<string>();
    }

    private static bool IsMatch(string articleToken, string queryToken)
    {
        if (string.IsNullOrWhiteSpace(articleToken) || string.IsNullOrWhiteSpace(queryToken))
        {
            return false;
        }

        if (articleToken == queryToken)
        {
            return true;
        }

        if (articleToken.StartsWith(queryToken, StringComparison.Ordinal) ||
            queryToken.StartsWith(articleToken, StringComparison.Ordinal))
        {
            return true;
        }

        if (queryToken.Length < 4 || articleToken.Length < 4)
        {
            return false;
        }

        var maxDistance = Math.Max(queryToken.Length, articleToken.Length) <= 6 ? 1 : 2;
        return LevenshteinDistance(articleToken, queryToken, maxDistance) <= maxDistance;
    }

    private static int LevenshteinDistance(string a, string b, int maxDistance)
    {
        var n = a.Length;
        var m = b.Length;
        if (Math.Abs(n - m) > maxDistance)
        {
            return maxDistance + 1;
        }

        var previous = new int[m + 1];
        var current = new int[m + 1];

        for (var j = 0; j <= m; j++)
        {
            previous[j] = j;
        }

        for (var i = 1; i <= n; i++)
        {
            current[0] = i;
            var minInRow = current[0];
            for (var j = 1; j <= m; j++)
            {
                var cost = a[i - 1] == b[j - 1] ? 0 : 1;
                current[j] = Math.Min(
                    Math.Min(current[j - 1] + 1, previous[j] + 1),
                    previous[j - 1] + cost);

                if (current[j] < minInRow)
                {
                    minInRow = current[j];
                }
            }

            if (minInRow > maxDistance)
            {
                return maxDistance + 1;
            }

            (previous, current) = (current, previous);
        }

        return previous[m];
    }

    private static string TransliterateLatinToCyrillic(string input)
    {
        if (string.IsNullOrWhiteSpace(input))
        {
            return string.Empty;
        }

        var value = input.ToLowerInvariant();
        var map = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["shch"] = "щ",
            ["sch"] = "щ",
            ["yo"] = "ё",
            ["zh"] = "ж",
            ["kh"] = "х",
            ["ts"] = "ц",
            ["ch"] = "ч",
            ["sh"] = "ш",
            ["yu"] = "ю",
            ["ya"] = "я",
            ["ye"] = "е"
        };

        var single = new Dictionary<char, string>
        {
            ['a'] = "а", ['b'] = "б", ['c'] = "к", ['d'] = "д", ['e'] = "е",
            ['f'] = "ф", ['g'] = "г", ['h'] = "х", ['i'] = "и", ['j'] = "й",
            ['k'] = "к", ['l'] = "л", ['m'] = "м", ['n'] = "н", ['o'] = "о",
            ['p'] = "п", ['q'] = "к", ['r'] = "р", ['s'] = "с", ['t'] = "т",
            ['u'] = "у", ['v'] = "в", ['w'] = "в", ['x'] = "кс", ['y'] = "ы",
            ['z'] = "з"
        };

        var sb = new StringBuilder();
        for (var i = 0; i < value.Length;)
        {
            var matched = false;
            foreach (var pair in map.OrderByDescending(p => p.Key.Length))
            {
                if (i + pair.Key.Length <= value.Length &&
                    value.AsSpan(i, pair.Key.Length).SequenceEqual(pair.Key))
                {
                    sb.Append(pair.Value);
                    i += pair.Key.Length;
                    matched = true;
                    break;
                }
            }

            if (matched)
            {
                continue;
            }

            var ch = value[i];
            if (single.TryGetValue(ch, out var repl))
            {
                sb.Append(repl);
            }
            else
            {
                sb.Append(ch);
            }
            i++;
        }

        return sb.ToString();
    }

    private static string ConvertKeyboardLayout(string input, bool enToRu)
    {
        if (string.IsNullOrWhiteSpace(input))
        {
            return string.Empty;
        }

        const string en = "`qwertyuiop[]asdfghjkl;'zxcvbnm,.";
        const string ru = "ёйцукенгшщзхъфывапролджэячсмитьбю";
        var from = enToRu ? en : ru;
        var to = enToRu ? ru : en;
        var map = from
            .Select((ch, index) => new { ch, index })
            .ToDictionary(x => x.ch, x => to[x.index]);

        var sb = new StringBuilder(input.Length);
        foreach (var raw in input.ToLowerInvariant())
        {
            sb.Append(map.TryGetValue(raw, out var converted) ? converted : raw);
        }

        return sb.ToString();
    }

    private static string StemRussian(string token)
    {
        if (token.Length <= 4)
        {
            return token;
        }

        var endings = new[]
        {
            "иями", "ями", "ами", "ями", "ого", "ему", "ому", "ее", "ие", "ые", "ая", "ое",
            "ий", "ый", "ой", "ам", "ям", "ах", "ях", "ов", "ев", "ия", "ья", "ие", "ые",
            "а", "я", "ы", "и", "е", "о", "у", "ю"
        };

        foreach (var ending in endings.OrderByDescending(x => x.Length))
        {
            if (token.EndsWith(ending, StringComparison.Ordinal) && token.Length - ending.Length >= 3)
            {
                return token[..^ending.Length];
            }
        }

        return token;
    }

    private static List<string> Tokenize(string text)
    {
        return NormalizeText(text)
            .Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Distinct(StringComparer.Ordinal)
            .ToList();
    }

    private static string NormalizeText(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return string.Empty;
        }

        var sb = new StringBuilder(text.Length);
        foreach (var ch in text.ToLowerInvariant())
        {
            var c = ch == 'ё' ? 'е' : ch;
            sb.Append(char.IsLetterOrDigit(c) ? c : ' ');
        }

        return string.Join(' ', sb.ToString()
            .Split(' ', StringSplitOptions.RemoveEmptyEntries));
    }

    private async Task<string> BuildUniqueSlugAsync(string title, Guid? skipArticleId = null)
    {
        static string ToSlug(string input)
        {
            var value = input.ToLowerInvariant();
            var chars = value
                .Select(c => char.IsLetterOrDigit(c) ? c : '-')
                .ToArray();
            var slug = string.Join(string.Empty, chars);
            while (slug.Contains("--"))
            {
                slug = slug.Replace("--", "-");
            }
            return slug.Trim('-');
        }

        var baseSlug = ToSlug(title);
        if (string.IsNullOrWhiteSpace(baseSlug))
        {
            baseSlug = "article";
        }

        var slug = baseSlug;
        var suffix = 1;
        while (await _db.Articles.AnyAsync(a => a.Slug == slug && (!skipArticleId.HasValue || a.Id != skipArticleId.Value)))
        {
            suffix++;
            slug = $"{baseSlug}-{suffix}";
        }

        return slug;
    }

    private async Task SyncCategoriesAsync(Article article, IEnumerable<string>? requestedCategories)
    {
        _db.ArticleCategories.RemoveRange(article.ArticleCategories);
        article.ArticleCategories.Clear();

        var names = (requestedCategories ?? Array.Empty<string>())
            .Select(c => c.Trim())
            .Where(c => !string.IsNullOrWhiteSpace(c))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        foreach (var name in names)
        {
            var category = await _db.Categories.FirstOrDefaultAsync(c => c.Name.ToLower() == name.ToLower());
            if (category is null)
            {
                category = new Category
                {
                    Id = Guid.NewGuid(),
                    Name = name,
                    Slug = await BuildCategorySlugAsync(name)
                };
                _db.Categories.Add(category);
            }

            article.ArticleCategories.Add(new ArticleCategory
            {
                ArticleId = article.Id,
                CategoryId = category.Id
            });
        }
    }

    private async Task<string> BuildCategorySlugAsync(string name)
    {
        var slug = new string(name
            .ToLowerInvariant()
            .Select(c => char.IsLetterOrDigit(c) ? c : '-')
            .ToArray()).Trim('-');

        if (string.IsNullOrWhiteSpace(slug))
        {
            slug = "category";
        }

        var candidate = slug;
        var i = 1;
        while (await _db.Categories.AnyAsync(c => c.Slug == candidate))
        {
            i++;
            candidate = $"{slug}-{i}";
        }

        return candidate;
    }

    private Task SyncKeywordsAsync(Article article, IEnumerable<string>? keywords)
    {
        _db.ArticleKeywords.RemoveRange(article.Keywords);
        article.Keywords.Clear();

        foreach (var value in (keywords ?? Array.Empty<string>())
                     .Select(k => k.Trim())
                     .Where(k => !string.IsNullOrWhiteSpace(k))
                     .Distinct(StringComparer.OrdinalIgnoreCase))
        {
            article.Keywords.Add(new ArticleKeyword
            {
                Id = Guid.NewGuid(),
                ArticleId = article.Id,
                Value = value
            });
        }

        return Task.CompletedTask;
    }

    private async Task UpdateAuthorProfileRatingAsync(Guid authorId)
    {
        var avg = await _db.Ratings
            .Where(r => r.Article.AuthorId == authorId && r.Article.Status == ArticleStatus.Published)
            .AverageAsync(r => (double?)r.Score) ?? 0;

        var publishedCount = await _db.Articles
            .Where(a => a.AuthorId == authorId && a.Status == ArticleStatus.Published)
            .CountAsync();

        var profile = await _db.AuthorProfiles.FirstOrDefaultAsync(p => p.UserId == authorId);
        if (profile is null)
        {
            profile = new AuthorProfile
            {
                UserId = authorId
            };
            _db.AuthorProfiles.Add(profile);
        }

        profile.AverageRating = Math.Round((decimal)avg, 2);
        profile.ArticlesPublished = publishedCount;
        await _db.SaveChangesAsync();
    }
}

public record ArticleSummaryDto(
    Guid Id,
    string Slug,
    string Title,
    string Summary,
    string AuthorName,
    IReadOnlyList<string> Categories,
    double AverageRating,
    int RatingsCount,
    DateTime? PublishedAt);

public record CommentDto(Guid Id, string AuthorName, string Text, DateTime CreatedAt, bool CanDelete);

public record ArticleDetailDto(
    Guid Id,
    string Slug,
    string Title,
    string Summary,
    string ContentHtml,
    string AuthorName,
    Guid AuthorId,
    IReadOnlyList<string> Categories,
    IReadOnlyList<string> Keywords,
    double AverageRating,
    int RatingsCount,
    decimal AuthorAverageRating,
    IReadOnlyList<CommentDto> Comments,
    DateTime? PublishedAt,
    bool IsFavorite);

public record UpsertArticleRequest(
    string? Title,
    string? Summary,
    string? ContentHtml,
    string? Status,
    IReadOnlyList<string>? Categories,
    IReadOnlyList<string>? Keywords);

public record RateArticleRequest(byte Score);
public record AddCommentRequest(string Text);
