using DigitalHelpSystem.Api.Data;
using DigitalHelpSystem.Api.Infrastructure;
using DigitalHelpSystem.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DigitalHelpSystem.Api.Controllers;

[ApiController]
[Route("api/users")]
[Authorize]
public class UserActivityController : ControllerBase
{
    private readonly AppDbContext _db;

    public UserActivityController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet("favorites")]
    public async Task<ActionResult<IReadOnlyList<ArticleSummaryDto>>> GetFavorites()
    {
        var userId = User.GetUserId();

        var items = await _db.UserFavorites
            .AsNoTracking()
            .Where(f => f.UserId == userId)
            .Include(f => f.Article)
                .ThenInclude(a => a.Author)
            .Include(f => f.Article)
                .ThenInclude(a => a.ArticleCategories)
                    .ThenInclude(ac => ac.Category)
            .Include(f => f.Article)
                .ThenInclude(a => a.Ratings)
            .OrderByDescending(f => f.AddedAt)
            .Select(f => new ArticleSummaryDto(
                f.Article.Id,
                f.Article.Slug,
                f.Article.Title,
                f.Article.Summary,
                f.Article.Author.DisplayName,
                f.Article.ArticleCategories.Select(ac => ac.Category.Name).ToArray(),
                f.Article.Ratings.Count == 0 ? 0 : Math.Round(f.Article.Ratings.Average(r => (double)r.Score), 2),
                f.Article.Ratings.Count,
                f.Article.PublishedAt))
            .ToListAsync();

        return Ok(items);
    }

    [HttpGet("favorites/{articleId:guid}")]
    public async Task<ActionResult> CheckFavorite(Guid articleId)
    {
        var userId = User.GetUserId();
        var exists = await _db.UserFavorites.AnyAsync(f => f.UserId == userId && f.ArticleId == articleId);
        return Ok(new { isFavorite = exists });
    }

    [HttpPost("favorites/{articleId:guid}")]
    public async Task<ActionResult> AddFavorite(Guid articleId)
    {
        var userId = User.GetUserId();
        var articleExists = await _db.Articles.AnyAsync(a => a.Id == articleId && a.Status == ArticleStatus.Published);
        if (!articleExists)
        {
            return NotFound(new { message = "Статья не найдена." });
        }

        var existing = await _db.UserFavorites.FirstOrDefaultAsync(f => f.UserId == userId && f.ArticleId == articleId);
        if (existing is null)
        {
            _db.UserFavorites.Add(new UserFavorite
            {
                UserId = userId,
                ArticleId = articleId,
                AddedAt = DateTime.UtcNow
            });
            await _db.SaveChangesAsync();
        }

        return NoContent();
    }

    [HttpDelete("favorites/{articleId:guid}")]
    public async Task<ActionResult> RemoveFavorite(Guid articleId)
    {
        var userId = User.GetUserId();
        var existing = await _db.UserFavorites.FirstOrDefaultAsync(f => f.UserId == userId && f.ArticleId == articleId);
        if (existing is not null)
        {
            _db.UserFavorites.Remove(existing);
            await _db.SaveChangesAsync();
        }

        return NoContent();
    }

    [HttpGet("history")]
    public async Task<ActionResult<IReadOnlyList<HistoryEntryDto>>> GetHistory()
    {
        var userId = User.GetUserId();

        var items = await _db.ViewedArticles
            .AsNoTracking()
            .Where(v => v.UserId == userId)
            .Include(v => v.Article)
                .ThenInclude(a => a.Author)
            .Include(v => v.Article)
                .ThenInclude(a => a.ArticleCategories)
                    .ThenInclude(ac => ac.Category)
            .Include(v => v.Article)
                .ThenInclude(a => a.Ratings)
            .OrderByDescending(v => v.ViewedAt)
            .Take(50)
            .Select(v => new HistoryEntryDto(
                v.Article.Id,
                v.Article.Slug,
                v.Article.Title,
                v.Article.Summary,
                v.Article.Author.DisplayName,
                v.Article.ArticleCategories.Select(ac => ac.Category.Name).ToArray(),
                v.ViewedAt,
                v.Article.Ratings.Count == 0 ? 0 : Math.Round(v.Article.Ratings.Average(r => (double)r.Score), 2),
                v.Article.Ratings.Count))
            .ToListAsync();

        return Ok(items);
    }
}

public record HistoryEntryDto(
    Guid Id,
    string Slug,
    string Title,
    string Summary,
    string AuthorName,
    IReadOnlyList<string> Categories,
    DateTime ViewedAt,
    double AverageRating,
    int RatingsCount);
