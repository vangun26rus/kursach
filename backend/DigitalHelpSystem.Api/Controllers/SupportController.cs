using DigitalHelpSystem.Api.Data;
using DigitalHelpSystem.Api.Infrastructure;
using DigitalHelpSystem.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DigitalHelpSystem.Api.Controllers;

[ApiController]
[Route("api/support")]
[Authorize]
public class SupportController : ControllerBase
{
    private readonly AppDbContext _db;
    private const string QuickHelpKind = "QuickHelp";
    private const string TechnicalIssueKind = "TechnicalIssue";

    public SupportController(AppDbContext db)
    {
        _db = db;
    }

    [HttpPost("tickets")]
    public async Task<ActionResult<TicketDto>> CreateTicket([FromBody] CreateTicketRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Subject) || string.IsNullOrWhiteSpace(request.Description))
        {
            return BadRequest(new { message = "Subject and description are required." });
        }

        var kind = NormalizeTicketKind(request.Kind);
        if (kind is null)
        {
            return BadRequest(new { message = "Kind must be QuickHelp or TechnicalIssue." });
        }

        var userId = User.GetUserId();
        var ticket = new FeedbackTicket
        {
            Id = Guid.NewGuid(),
            CreatedByUserId = userId,
            Subject = request.Subject.Trim(),
            Description = request.Description.Trim(),
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            Status = TicketStatus.Open
        };

        _db.FeedbackTickets.Add(ticket);
        _db.TicketMessages.Add(new TicketMessage
        {
            Id = Guid.NewGuid(),
            TicketId = ticket.Id,
            SenderUserId = userId,
            Message = request.Description.Trim(),
            CreatedAt = DateTime.UtcNow
        });

        if (kind == QuickHelpKind)
        {
            _db.ChatRooms.Add(new ChatRoom
            {
                Id = Guid.NewGuid(),
                TicketId = ticket.Id,
                CreatedAt = DateTime.UtcNow
            });
        }

        await _db.SaveChangesAsync();
        return Ok(new TicketDto(ticket.Id, ticket.Subject, kind, ticket.Status.ToString(), ticket.CreatedAt, ticket.UpdatedAt));
    }

    [HttpGet("tickets/my")]
    public async Task<ActionResult<IReadOnlyList<TicketDto>>> MyTickets()
    {
        var userId = User.GetUserId();
        var tickets = await _db.FeedbackTickets
            .AsNoTracking()
            .Where(t => t.CreatedByUserId == userId)
            .OrderByDescending(t => t.UpdatedAt)
            .Select(t => new TicketDto(
                t.Id,
                t.Subject,
                t.ChatRoom != null ? QuickHelpKind : TechnicalIssueKind,
                t.Status.ToString(),
                t.CreatedAt,
                t.UpdatedAt))
            .ToListAsync();
        return Ok(tickets);
    }

    [HttpGet("tickets")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<IReadOnlyList<TicketDto>>> TicketsForStaff()
    {
        var ticketsQuery = _db.FeedbackTickets
            .AsNoTracking()
            // Technical issues only (quick-help tickets have chat rooms).
            .Where(t => t.ChatRoom == null);

        var tickets = await ticketsQuery
            .OrderByDescending(t => t.UpdatedAt)
            .Select(t => new TicketDto(
                t.Id,
                t.Subject,
                t.ChatRoom != null ? QuickHelpKind : TechnicalIssueKind,
                t.Status.ToString(),
                t.CreatedAt,
                t.UpdatedAt))
            .ToListAsync();
        return Ok(tickets);
    }

    [HttpGet("tickets/{id:guid}/messages")]
    public async Task<ActionResult<IReadOnlyList<TicketMessageDto>>> TicketMessages(Guid id)
    {
        var ticket = await _db.FeedbackTickets
            .AsNoTracking()
            .Select(t => new { t.Id, IsQuickHelp = t.ChatRoom != null })
            .FirstOrDefaultAsync(t => t.Id == id);
        if (ticket is null)
        {
            return NotFound();
        }
        if (ticket.IsQuickHelp)
        {
            return BadRequest(new { message = "Quick-help requests are processed in chat." });
        }

        if (!await CanAccessTicketAsync(id))
        {
            return Forbid();
        }

        var messages = await _db.TicketMessages
            .AsNoTracking()
            .Where(m => m.TicketId == id)
            .Include(m => m.SenderUser)
            .OrderBy(m => m.CreatedAt)
            .Select(m => new TicketMessageDto(m.Id, m.SenderUserId, m.SenderUser.DisplayName, m.Message, m.CreatedAt))
            .ToListAsync();

        return Ok(messages);
    }

    [HttpPost("tickets/{id:guid}/messages")]
    public async Task<ActionResult<TicketMessageDto>> AddTicketMessage(Guid id, [FromBody] AddSupportMessageRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Message))
        {
            return BadRequest(new { message = "Message is required." });
        }

        var ticketForKind = await _db.FeedbackTickets
            .AsNoTracking()
            .Select(t => new { t.Id, IsQuickHelp = t.ChatRoom != null })
            .FirstOrDefaultAsync(t => t.Id == id);
        if (ticketForKind is null)
        {
            return NotFound();
        }
        if (ticketForKind.IsQuickHelp)
        {
            return BadRequest(new { message = "Quick-help requests are processed in chat." });
        }

        if (!await CanAccessTicketAsync(id))
        {
            return Forbid();
        }

        var userId = User.GetUserId();
        var now = DateTime.UtcNow;
        var message = new TicketMessage
        {
            Id = Guid.NewGuid(),
            TicketId = id,
            SenderUserId = userId,
            Message = request.Message.Trim(),
            CreatedAt = now
        };

        _db.TicketMessages.Add(message);
        var ticket = await _db.FeedbackTickets.FirstAsync(t => t.Id == id);
        ticket.UpdatedAt = now;
        if (ticket.Status == TicketStatus.Closed || ticket.Status == TicketStatus.Resolved)
        {
            ticket.Status = TicketStatus.InProgress;
        }

        await _db.SaveChangesAsync();

        var senderName = await _db.Users.Where(u => u.Id == userId).Select(u => u.DisplayName).FirstAsync();
        return Ok(new TicketMessageDto(message.Id, userId, senderName, message.Message, message.CreatedAt));
    }

    [HttpPost("tickets/{id:guid}/status")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult> ChangeStatus(Guid id, [FromBody] ChangeTicketStatusRequest request)
    {
        var ticket = await _db.FeedbackTickets.FirstOrDefaultAsync(t => t.Id == id);
        if (ticket is null)
        {
            return NotFound();
        }

        if (!Enum.TryParse<TicketStatus>(request.Status, ignoreCase: true, out var parsed))
        {
            return BadRequest(new { message = "Unknown ticket status." });
        }

        ticket.Status = parsed;
        ticket.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("tickets/{id:guid}/chat/open")]
    [Authorize(Roles = "Admin")]
    public async Task<ActionResult<Guid>> OpenChat(Guid id)
    {
        var ticket = await _db.FeedbackTickets
            .Include(t => t.ChatRoom)
            .FirstOrDefaultAsync(t => t.Id == id);
        if (ticket is null)
        {
            return NotFound();
        }

        if (ticket.ChatRoom is not null)
        {
            return Ok(ticket.ChatRoom.Id);
        }

        // Technical issue tickets are handled by admins without chat.
        return BadRequest(new { message = "Chat can be opened only for quick-help tickets." });
    }

    [HttpGet("chat/rooms")]
    [Authorize(Roles = "Reader,Author,Admin")]
    public async Task<ActionResult<IReadOnlyList<ChatRoomDto>>> GetChatRooms()
    {
        var userId = User.GetUserId();
        var isStaff = User.IsInRole("Admin") || User.IsInRole("Author");

        var query = _db.ChatRooms
            .AsNoTracking()
            .Include(r => r.Ticket)
            .Where(r => !r.IsClosed);

        if (!isStaff)
        {
            query = query.Where(r => r.Ticket.CreatedByUserId == userId);
        }

        var rooms = await query
            .OrderByDescending(r => r.CreatedAt)
            .Select(r => new ChatRoomDto(r.Id, r.TicketId, r.Ticket.Subject, r.IsClosed, r.CreatedAt))
            .ToListAsync();

        return Ok(rooms);
    }

    [HttpGet("chat/rooms/{roomId:guid}/messages")]
    [Authorize(Roles = "Reader,Author,Admin")]
    public async Task<ActionResult<IReadOnlyList<ChatMessageDto>>> GetChatMessages(Guid roomId)
    {
        if (!await CanAccessRoomAsync(roomId))
        {
            return Forbid();
        }

        var messages = await _db.ChatMessages
            .AsNoTracking()
            .Include(m => m.SenderUser)
            .Where(m => m.RoomId == roomId)
            .OrderBy(m => m.SentAt)
            .Select(m => new ChatMessageDto(m.Id, m.RoomId, m.SenderUserId, m.SenderUser.DisplayName, m.Message, m.SentAt))
            .ToListAsync();
        return Ok(messages);
    }

    [HttpPost("chat/rooms/{roomId:guid}/messages")]
    [Authorize(Roles = "Reader,Author,Admin")]
    public async Task<ActionResult<ChatMessageDto>> SendChatMessage(Guid roomId, [FromBody] AddSupportMessageRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Message))
        {
            return BadRequest(new { message = "Message is required." });
        }

        if (!await CanAccessRoomAsync(roomId))
        {
            return Forbid();
        }

        var userId = User.GetUserId();
        var now = DateTime.UtcNow;
        var message = new ChatMessage
        {
            Id = Guid.NewGuid(),
            RoomId = roomId,
            SenderUserId = userId,
            Message = request.Message.Trim(),
            SentAt = now
        };
        _db.ChatMessages.Add(message);
        await _db.SaveChangesAsync();

        var senderName = await _db.Users.Where(u => u.Id == userId).Select(u => u.DisplayName).FirstAsync();
        return Ok(new ChatMessageDto(message.Id, roomId, userId, senderName, message.Message, now));
    }

    private async Task<bool> CanAccessTicketAsync(Guid ticketId)
    {
        var userId = User.GetUserId();
        if (User.IsInRole("Admin"))
        {
            return await _db.FeedbackTickets.AnyAsync(t => t.Id == ticketId);
        }

        return await _db.FeedbackTickets.AnyAsync(t => t.Id == ticketId && t.CreatedByUserId == userId);
    }

    private async Task<bool> CanAccessRoomAsync(Guid roomId)
    {
        var userId = User.GetUserId();
        if (User.IsInRole("Admin") || User.IsInRole("Author"))
        {
            return await _db.ChatRooms.AnyAsync(r => r.Id == roomId && !r.IsClosed);
        }

        return await _db.ChatRooms.AnyAsync(r => r.Id == roomId && !r.IsClosed && r.Ticket.CreatedByUserId == userId);
    }

    private static string? NormalizeTicketKind(string? kind)
    {
        if (string.IsNullOrWhiteSpace(kind))
        {
            return QuickHelpKind;
        }

        return kind.Trim().ToLowerInvariant() switch
        {
            "quickhelp" => QuickHelpKind,
            "technicalissue" => TechnicalIssueKind,
            _ => null
        };
    }
}

public record CreateTicketRequest(string Subject, string Description, string Kind, bool OpenChatImmediately);
public record AddSupportMessageRequest(string Message);
public record ChangeTicketStatusRequest(string Status);
public record TicketDto(Guid Id, string Subject, string Kind, string Status, DateTime CreatedAt, DateTime UpdatedAt);
public record TicketMessageDto(Guid Id, Guid SenderUserId, string SenderName, string Message, DateTime CreatedAt);
public record ChatRoomDto(Guid Id, Guid TicketId, string Subject, bool IsClosed, DateTime CreatedAt);
public record ChatMessageDto(Guid Id, Guid RoomId, Guid SenderUserId, string SenderName, string Message, DateTime SentAt);
