namespace DigitalHelpSystem.Api.Infrastructure;

public class JwtFromCookieMiddleware
{
    private readonly RequestDelegate _next;

    public JwtFromCookieMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var hasAuthorizationHeader = context.Request.Headers.ContainsKey("Authorization");
        if (!hasAuthorizationHeader && context.Request.Cookies.TryGetValue("access_token", out var token))
        {
            context.Request.Headers.Authorization = $"Bearer {token}";
        }

        await _next(context);
    }
}
