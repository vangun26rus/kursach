using DigitalHelpSystem.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace DigitalHelpSystem.Api.Data;

public class AppDbContext : IdentityDbContext<AppUser, AppRole, Guid>
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<AuthorProfile> AuthorProfiles => Set<AuthorProfile>();
    public DbSet<Article> Articles => Set<Article>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<ArticleCategory> ArticleCategories => Set<ArticleCategory>();
    public DbSet<ArticleKeyword> ArticleKeywords => Set<ArticleKeyword>();
    public DbSet<Rating> Ratings => Set<Rating>();
    public DbSet<Comment> Comments => Set<Comment>();
    public DbSet<FeedbackTicket> FeedbackTickets => Set<FeedbackTicket>();
    public DbSet<TicketMessage> TicketMessages => Set<TicketMessage>();
    public DbSet<ChatRoom> ChatRooms => Set<ChatRoom>();
    public DbSet<ChatMessage> ChatMessages => Set<ChatMessage>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<AppUser>().ToTable("Users");
        builder.Entity<AppRole>().ToTable("Roles");
        builder.Entity<IdentityUserRole<Guid>>().ToTable("UserRoles");
        builder.Entity<IdentityUserClaim<Guid>>().ToTable("UserClaims");
        builder.Entity<IdentityUserLogin<Guid>>().ToTable("UserLogins");
        builder.Entity<IdentityRoleClaim<Guid>>().ToTable("RoleClaims");
        builder.Entity<IdentityUserToken<Guid>>().ToTable("UserTokens");

        builder.Entity<AuthorProfile>(e =>
        {
            e.HasKey(x => x.UserId);
            e.HasOne(x => x.User)
                .WithOne(x => x.AuthorProfile)
                .HasForeignKey<AuthorProfile>(x => x.UserId);
        });

        builder.Entity<Article>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.Slug).IsUnique();
            e.HasIndex(x => new { x.AuthorId, x.PublishedAt });
            e.Property(x => x.Title).HasMaxLength(300);
            e.Property(x => x.Slug).HasMaxLength(300);
            e.Property(x => x.Summary).HasMaxLength(700);
            e.Property(x => x.ContentHtml).HasColumnType("text");
        });

        builder.Entity<Category>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.Name).IsUnique();
            e.HasIndex(x => x.Slug).IsUnique();
            e.Property(x => x.Name).HasMaxLength(100);
            e.Property(x => x.Slug).HasMaxLength(120);
        });

        builder.Entity<ArticleCategory>(e =>
        {
            e.HasKey(x => new { x.ArticleId, x.CategoryId });
            e.HasOne(x => x.Article)
                .WithMany(x => x.ArticleCategories)
                .HasForeignKey(x => x.ArticleId);
            e.HasOne(x => x.Category)
                .WithMany(x => x.ArticleCategories)
                .HasForeignKey(x => x.CategoryId);
        });

        builder.Entity<ArticleKeyword>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.Value);
            e.Property(x => x.Value).HasMaxLength(100);
        });

        builder.Entity<Rating>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.ArticleId);
            e.HasIndex(x => new { x.UserId, x.ArticleId }).IsUnique();
            e.ToTable(t => t.HasCheckConstraint("CK_Ratings_Score", "\"Score\" >= 1 AND \"Score\" <= 5"));
        });

        builder.Entity<Comment>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.ArticleId, x.CreatedAt });
            e.Property(x => x.Text).HasMaxLength(2000);
        });

        builder.Entity<FeedbackTicket>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.Status, x.CreatedAt });
            e.Property(x => x.Subject).HasMaxLength(200);
            e.Property(x => x.Description).HasMaxLength(4000);
        });

        builder.Entity<TicketMessage>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.TicketId, x.CreatedAt });
            e.Property(x => x.Message).HasMaxLength(2000);
        });

        builder.Entity<ChatRoom>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.TicketId).IsUnique();
            e.HasOne(x => x.Ticket)
                .WithOne(x => x.ChatRoom)
                .HasForeignKey<ChatRoom>(x => x.TicketId);
        });

        builder.Entity<ChatMessage>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.RoomId, x.SentAt });
            e.Property(x => x.Message).HasMaxLength(2000);
        });
    }
}
