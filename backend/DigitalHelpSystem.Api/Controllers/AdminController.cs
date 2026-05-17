using DigitalHelpSystem.Api.Data;
using DigitalHelpSystem.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DigitalHelpSystem.Api.Controllers;

[ApiController]
[Route("api/admin")]
[Authorize(Roles = "Admin")]
public class AdminController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly UserManager<AppUser> _userManager;

    public AdminController(AppDbContext db, UserManager<AppUser> userManager)
    {
        _db = db;
        _userManager = userManager;
    }

    [HttpGet("dashboard")]
    public async Task<ActionResult<AdminDashboardDto>> Dashboard()
    {
        var dto = new AdminDashboardDto(
            TotalUsers: await _db.Users.CountAsync(),
            TotalArticles: await _db.Articles.CountAsync(),
            PublishedArticles: await _db.Articles.CountAsync(a => a.Status == ArticleStatus.Published),
            OpenTickets: await _db.FeedbackTickets.CountAsync(t => t.Status == TicketStatus.Open || t.Status == TicketStatus.InProgress),
            TotalComments: await _db.Comments.CountAsync(c => !c.IsDeleted));
        return Ok(dto);
    }

    [HttpGet("users")]
    public async Task<ActionResult<IReadOnlyList<UserAdminDto>>> Users()
    {
        var users = await _db.Users.AsNoTracking().OrderBy(u => u.CreatedAt).ToListAsync();
        var result = new List<UserAdminDto>(users.Count);

        foreach (var user in users)
        {
            var roles = await _userManager.GetRolesAsync(user);
            result.Add(new UserAdminDto(user.Id, user.Email ?? string.Empty, user.DisplayName, roles));
        }

        return Ok(result);
    }

    [HttpPut("users/{id:guid}/role")]
    public async Task<ActionResult> SetRole(Guid id, [FromBody] SetUserRoleRequest request)
    {
        var normalizedRole = request.Role?.Trim();
        if (normalizedRole is not ("Reader" or "Author" or "Admin"))
        {
            return BadRequest(new { message = "Role must be Reader, Author or Admin." });
        }

        var user = await _userManager.FindByIdAsync(id.ToString());
        if (user is null)
        {
            return NotFound();
        }

        var currentRoles = await _userManager.GetRolesAsync(user);
        if (currentRoles.Count > 0)
        {
            await _userManager.RemoveFromRolesAsync(user, currentRoles);
        }

        await _userManager.AddToRoleAsync(user, normalizedRole);

        if (normalizedRole == "Author")
        {
            var profileExists = await _db.AuthorProfiles.AnyAsync(p => p.UserId == id);
            if (!profileExists)
            {
                _db.AuthorProfiles.Add(new AuthorProfile
                {
                    UserId = id,
                    Bio = string.Empty,
                    AverageRating = 0,
                    ArticlesPublished = 0
                });
                await _db.SaveChangesAsync();
            }
        }

        return NoContent();
    }
}

public record AdminDashboardDto(int TotalUsers, int TotalArticles, int PublishedArticles, int OpenTickets, int TotalComments);
public record UserAdminDto(Guid Id, string Email, string DisplayName, IList<string> Roles);
public record SetUserRoleRequest(string Role);
