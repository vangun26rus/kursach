using DigitalHelpSystem.Api.Data;
using DigitalHelpSystem.Api.Infrastructure;
using DigitalHelpSystem.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DigitalHelpSystem.Api.Controllers;

[ApiController]
[Route("api/author")]
[Authorize(Roles = "Author,Admin")]
public class AuthorController : ControllerBase
{
    private readonly AppDbContext _db;

    public AuthorController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet("dashboard")]
    public async Task<ActionResult<AuthorDashboardDto>> Dashboard()
    {
        var userId = User.GetUserId();
        var profile = await _db.AuthorProfiles.AsNoTracking().FirstOrDefaultAsync(p => p.UserId == userId);

        var articles = await _db.Articles
            .AsNoTracking()
            .Include(a => a.Ratings)
            .Where(a => a.AuthorId == userId)
            .OrderByDescending(a => a.UpdatedAt)
            .Select(a => new AuthorArticleDto(
                a.Id,
                a.Slug,
                a.Title,
                a.Status.ToString(),
                a.Ratings.Count == 0 ? 0 : Math.Round(a.Ratings.Average(r => (double)r.Score), 2),
                a.Ratings.Count,
                a.UpdatedAt,
                a.PublishedAt))
            .ToListAsync();

        var dto = new AuthorDashboardDto(
            profile?.AverageRating ?? 0,
            profile?.ArticlesPublished ?? 0,
            articles);

        return Ok(dto);
    }

    [HttpGet("articles/{id:guid}")]
    public async Task<ActionResult<AuthorArticleEditDto>> GetArticleForEdit(Guid id)
    {
        var article = await _db.Articles
            .AsNoTracking()
            .Include(a => a.ArticleCategories)
                .ThenInclude(ac => ac.Category)
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

        return Ok(new AuthorArticleEditDto(
            article.Id,
            article.Title,
            article.Summary,
            article.ContentHtml,
            article.Status.ToString(),
            article.ArticleCategories
                .Select(ac => ac.Category.Name)
                .OrderBy(name => name)
                .ToArray(),
            article.Keywords
                .Select(k => k.Value)
                .OrderBy(value => value)
                .ToArray()));
    }
}

public record AuthorDashboardDto(decimal AverageRating, int PublishedArticles, IReadOnlyList<AuthorArticleDto> Articles);
public record AuthorArticleDto(
    Guid Id,
    string Slug,
    string Title,
    string Status,
    double AverageRating,
    int RatingsCount,
    DateTime UpdatedAt,
    DateTime? PublishedAt);

public record AuthorArticleEditDto(
    Guid Id,
    string Title,
    string Summary,
    string ContentHtml,
    string Status,
    IReadOnlyList<string> Categories,
    IReadOnlyList<string> Keywords);
