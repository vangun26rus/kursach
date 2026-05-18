using System.Text;
using DigitalHelpSystem.Api.Data;
using DigitalHelpSystem.Api.Hubs;
using DigitalHelpSystem.Api.Infrastructure;
using DigitalHelpSystem.Api.Models;
using DigitalHelpSystem.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddSignalR();

builder.Services.AddDbContext<AppDbContext>(options =>
{
    var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
                           ?? throw new InvalidOperationException("Connection string is missing.");

    if (connectionString.Contains("Host=", StringComparison.OrdinalIgnoreCase))
    {
        options.UseNpgsql(connectionString);
    }
    else
    {
        options.UseSqlite(connectionString);
    }
});

builder.Services
    .AddIdentity<AppUser, AppRole>(options =>
    {
        options.Password.RequireDigit = true;
        options.Password.RequireUppercase = false;
        options.Password.RequireLowercase = true;
        options.Password.RequireNonAlphanumeric = false;
        options.Password.RequiredLength = 6;
        options.User.RequireUniqueEmail = true;
    })
    .AddEntityFrameworkStores<AppDbContext>()
    .AddDefaultTokenProviders();

builder.Services.AddScoped<JwtTokenService>();

builder.Services.AddCors(options =>
{
    options.AddPolicy("frontend", policy =>
        policy
            .AllowAnyHeader()
            .AllowAnyMethod()
            .SetIsOriginAllowed(_ => true)
            .AllowCredentials());
});

builder.Services
    .AddAuthentication(options =>
    {
        options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
        options.DefaultScheme = JwtBearerDefaults.AuthenticationScheme;
    })
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Key"]!))
        };

        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var path = context.HttpContext.Request.Path;
                if (path.StartsWithSegments("/hubs/support"))
                {
                    var accessToken = context.Request.Query["access_token"];
                    if (!string.IsNullOrWhiteSpace(accessToken))
                    {
                        context.Token = accessToken;
                    }
                }
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("AdminOnly", policy => policy.RequireRole("Admin"));
    options.AddPolicy("AuthorOrAdmin", policy => policy.RequireRole("Author", "Admin"));
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseMiddleware<JwtFromCookieMiddleware>();
app.UseCors("frontend");
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHub<SupportHub>("/hubs/support");

await using (var scope = app.Services.CreateAsyncScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.EnsureCreatedAsync();
    await EnsureFavoritesAndHistoryTablesExistAsync(db);
    await SeedData.InitializeAsync(scope.ServiceProvider);
}

app.Run();

static async Task EnsureFavoritesAndHistoryTablesExistAsync(AppDbContext db)
{
    if (!db.Database.IsSqlite())
    {
        return;
    }

    await db.Database.ExecuteSqlRawAsync(@"CREATE TABLE IF NOT EXISTS ""UserFavorites"" (
        ""UserId"" TEXT NOT NULL,
        ""ArticleId"" TEXT NOT NULL,
        ""AddedAt"" TEXT NOT NULL,
        PRIMARY KEY (""UserId"", ""ArticleId""),
        FOREIGN KEY (""UserId"") REFERENCES ""Users"" (""Id"") ON DELETE CASCADE,
        FOREIGN KEY (""ArticleId"") REFERENCES ""Articles"" (""Id"") ON DELETE CASCADE
    );");

    await db.Database.ExecuteSqlRawAsync(@"CREATE INDEX IF NOT EXISTS ""IX_UserFavorites_AddedAt"" ON ""UserFavorites"" (""AddedAt"");");

    await db.Database.ExecuteSqlRawAsync(@"CREATE TABLE IF NOT EXISTS ""ViewedArticles"" (
        ""UserId"" TEXT NOT NULL,
        ""ArticleId"" TEXT NOT NULL,
        ""ViewedAt"" TEXT NOT NULL,
        PRIMARY KEY (""UserId"", ""ArticleId""),
        FOREIGN KEY (""UserId"") REFERENCES ""Users"" (""Id"") ON DELETE CASCADE,
        FOREIGN KEY (""ArticleId"") REFERENCES ""Articles"" (""Id"") ON DELETE CASCADE
    );");

    await db.Database.ExecuteSqlRawAsync(@"CREATE INDEX IF NOT EXISTS ""IX_ViewedArticles_ViewedAt"" ON ""ViewedArticles"" (""ViewedAt"");");
}
