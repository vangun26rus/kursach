using System.Security.Claims;

namespace DigitalHelpSystem.Api.Infrastructure;

public static class ClaimsPrincipalExtensions
{
    public static Guid GetUserId(this ClaimsPrincipal user)
    {
        var value = user.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(value, out var id))
        {
            throw new InvalidOperationException("Authenticated user has no valid id claim.");
        }

        return id;
    }
}
