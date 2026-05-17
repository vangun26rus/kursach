using DigitalHelpSystem.Api.Data;
using DigitalHelpSystem.Api.Infrastructure;
using DigitalHelpSystem.Api.Models;
using DigitalHelpSystem.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace DigitalHelpSystem.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly UserManager<AppUser> _userManager;
    private readonly AppDbContext _db;
    private readonly JwtTokenService _jwtTokenService;

    public AuthController(
        UserManager<AppUser> userManager,
        AppDbContext db,
        JwtTokenService jwtTokenService)
    {
        _userManager = userManager;
        _db = db;
        _jwtTokenService = jwtTokenService;
    }

    [HttpPost("register")]
    [AllowAnonymous]
    public async Task<ActionResult<AuthResponse>> Register([FromBody] RegisterRequest request)
    {
        var role = NormalizeRole(request.Role);
        if (role is null || role == "Admin")
        {
            return BadRequest(new { message = "Role must be Reader or Author." });
        }

        var user = new AppUser
        {
            UserName = request.Email,
            Email = request.Email,
            DisplayName = request.DisplayName.Trim()
        };

        var createResult = await _userManager.CreateAsync(user, request.Password);
        if (!createResult.Succeeded)
        {
            return BadRequest(createResult.Errors.Select(e => e.Description));
        }

        await _userManager.AddToRoleAsync(user, role);
        if (role == "Author")
        {
            _db.AuthorProfiles.Add(new AuthorProfile
            {
                UserId = user.Id,
                Bio = string.Empty,
                AverageRating = 0,
                ArticlesPublished = 0
            });
            await _db.SaveChangesAsync();
        }

        var roles = await _userManager.GetRolesAsync(user);
        var token = _jwtTokenService.CreateToken(user, roles);
        WriteAuthCookie(token);

        return Ok(new AuthResponse(
            user.Id,
            user.Email!,
            user.DisplayName,
            roles,
            token));
    }

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<ActionResult<AuthResponse>> Login([FromBody] LoginRequest request)
    {
        var user = await _userManager.FindByEmailAsync(request.Email);
        if (user is null)
        {
            return Unauthorized(new { message = "Invalid credentials." });
        }

        var validPassword = await _userManager.CheckPasswordAsync(user, request.Password);
        if (!validPassword)
        {
            return Unauthorized(new { message = "Invalid credentials." });
        }

        var roles = await _userManager.GetRolesAsync(user);
        var token = _jwtTokenService.CreateToken(user, roles);
        WriteAuthCookie(token);

        return Ok(new AuthResponse(
            user.Id,
            user.Email!,
            user.DisplayName,
            roles,
            token));
    }

    [HttpPost("logout")]
    [Authorize]
    public IActionResult Logout()
    {
        Response.Cookies.Delete("access_token");
        return NoContent();
    }

    [HttpGet("me")]
    [Authorize]
    public async Task<ActionResult<AuthResponse>> Me()
    {
        var userId = User.GetUserId();
        var user = await _userManager.FindByIdAsync(userId.ToString());
        if (user is null)
        {
            return NotFound();
        }

        var roles = await _userManager.GetRolesAsync(user);
        return Ok(new AuthResponse(
            user.Id,
            user.Email!,
            user.DisplayName,
            roles,
            string.Empty));
    }

    private static string? NormalizeRole(string? input)
    {
        if (string.IsNullOrWhiteSpace(input))
        {
            return "Reader";
        }

        return input.Trim().ToLowerInvariant() switch
        {
            "reader" => "Reader",
            "author" => "Author",
            "admin" => "Admin",
            _ => null
        };
    }

    private void WriteAuthCookie(string token)
    {
        Response.Cookies.Append("access_token", token, new CookieOptions
        {
            HttpOnly = true,
            IsEssential = true,
            SameSite = SameSiteMode.Lax,
            Secure = false,
            Expires = DateTimeOffset.UtcNow.AddHours(12)
        });
    }
}

public record RegisterRequest(string Email, string Password, string DisplayName, string? Role);
public record LoginRequest(string Email, string Password);
public record AuthResponse(Guid Id, string Email, string DisplayName, IList<string> Roles, string Token);
