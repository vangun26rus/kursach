using Microsoft.AspNetCore.Identity;

namespace DigitalHelpSystem.Api.Models;

public enum TicketStatus
{
    Open = 1,
    InProgress = 2,
    Resolved = 3,
    Closed = 4
}

public enum ArticleStatus
{
    Draft = 1,
    Published = 2,
    Archived = 3
}

public class AppUser : IdentityUser<Guid>
{
    public string DisplayName { get; set; } = default!;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public AuthorProfile? AuthorProfile { get; set; }
    public ICollection<Article> AuthoredArticles { get; set; } = new List<Article>();
    public ICollection<Rating> Ratings { get; set; } = new List<Rating>();
    public ICollection<Comment> Comments { get; set; } = new List<Comment>();
    public ICollection<UserFavorite> Favorites { get; set; } = new List<UserFavorite>();
    public ICollection<ViewedArticle> ViewedArticles { get; set; } = new List<ViewedArticle>();
}

public class AppRole : IdentityRole<Guid>;

public class AuthorProfile
{
    public Guid UserId { get; set; }
    public AppUser User { get; set; } = default!;
    public string Bio { get; set; } = string.Empty;
    public string? AvatarUrl { get; set; }
    public decimal AverageRating { get; set; }
    public int ArticlesPublished { get; set; }
}

public class Article
{
    public Guid Id { get; set; }
    public Guid AuthorId { get; set; }
    public AppUser Author { get; set; } = default!;

    public string Title { get; set; } = default!;
    public string Slug { get; set; } = default!;
    public string Summary { get; set; } = string.Empty;
    public string ContentHtml { get; set; } = default!;
    public ArticleStatus Status { get; set; } = ArticleStatus.Draft;
    public DateTime? PublishedAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<ArticleCategory> ArticleCategories { get; set; } = new List<ArticleCategory>();
    public ICollection<ArticleKeyword> Keywords { get; set; } = new List<ArticleKeyword>();
    public ICollection<Rating> Ratings { get; set; } = new List<Rating>();
    public ICollection<Comment> Comments { get; set; } = new List<Comment>();
    public ICollection<UserFavorite> UserFavorites { get; set; } = new List<UserFavorite>();
    public ICollection<ViewedArticle> ViewedArticles { get; set; } = new List<ViewedArticle>();
}

public class Category
{
    public Guid Id { get; set; }
    public string Name { get; set; } = default!;
    public string Slug { get; set; } = default!;
    public ICollection<ArticleCategory> ArticleCategories { get; set; } = new List<ArticleCategory>();
}

public class ArticleCategory
{
    public Guid ArticleId { get; set; }
    public Article Article { get; set; } = default!;
    public Guid CategoryId { get; set; }
    public Category Category { get; set; } = default!;
}

public class ArticleKeyword
{
    public Guid Id { get; set; }
    public Guid ArticleId { get; set; }
    public Article Article { get; set; } = default!;
    public string Value { get; set; } = default!;
}

public class Rating
{
    public Guid Id { get; set; }
    public Guid ArticleId { get; set; }
    public Article Article { get; set; } = default!;
    public Guid UserId { get; set; }
    public AppUser User { get; set; } = default!;
    public byte Score { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Comment
{
    public Guid Id { get; set; }
    public Guid ArticleId { get; set; }
    public Article Article { get; set; } = default!;
    public Guid UserId { get; set; }
    public AppUser User { get; set; } = default!;
    public string Text { get; set; } = default!;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public bool IsDeleted { get; set; }
}

public class UserFavorite
{
    public Guid UserId { get; set; }
    public AppUser User { get; set; } = default!;
    public Guid ArticleId { get; set; }
    public Article Article { get; set; } = default!;
    public DateTime AddedAt { get; set; } = DateTime.UtcNow;
}

public class ViewedArticle
{
    public Guid UserId { get; set; }
    public AppUser User { get; set; } = default!;
    public Guid ArticleId { get; set; }
    public Article Article { get; set; } = default!;
    public DateTime ViewedAt { get; set; } = DateTime.UtcNow;
}

public class FeedbackTicket
{
    public Guid Id { get; set; }
    public Guid CreatedByUserId { get; set; }
    public AppUser CreatedByUser { get; set; } = default!;
    public string Subject { get; set; } = default!;
    public string Description { get; set; } = default!;
    public TicketStatus Status { get; set; } = TicketStatus.Open;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<TicketMessage> Messages { get; set; } = new List<TicketMessage>();
    public ChatRoom? ChatRoom { get; set; }
}

public class TicketMessage
{
    public Guid Id { get; set; }
    public Guid TicketId { get; set; }
    public FeedbackTicket Ticket { get; set; } = default!;
    public Guid SenderUserId { get; set; }
    public AppUser SenderUser { get; set; } = default!;
    public string Message { get; set; } = default!;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class ChatRoom
{
    public Guid Id { get; set; }
    public Guid TicketId { get; set; }
    public FeedbackTicket Ticket { get; set; } = default!;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public bool IsClosed { get; set; }

    public ICollection<ChatMessage> Messages { get; set; } = new List<ChatMessage>();
}

public class ChatMessage
{
    public Guid Id { get; set; }
    public Guid RoomId { get; set; }
    public ChatRoom Room { get; set; } = default!;
    public Guid SenderUserId { get; set; }
    public AppUser SenderUser { get; set; } = default!;
    public string Message { get; set; } = default!;
    public DateTime SentAt { get; set; } = DateTime.UtcNow;
}
