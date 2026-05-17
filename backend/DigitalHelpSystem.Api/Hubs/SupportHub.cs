using DigitalHelpSystem.Api.Data;
using DigitalHelpSystem.Api.Infrastructure;
using DigitalHelpSystem.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace DigitalHelpSystem.Api.Hubs;

[Authorize]
public class SupportHub : Hub
{
    private readonly AppDbContext _db;

    public SupportHub(AppDbContext db)
    {
        _db = db;
    }

    public async Task JoinRoom(Guid roomId)
    {
        var userId = Context.User!.GetUserId();
        if (!await CanAccessRoomAsync(roomId, userId))
        {
            throw new HubException("Access denied.");
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, roomId.ToString());
    }

    public async Task SendMessage(Guid roomId, string message)
    {
        if (string.IsNullOrWhiteSpace(message))
        {
            throw new HubException("Message cannot be empty.");
        }

        var userId = Context.User!.GetUserId();
        if (!await CanAccessRoomAsync(roomId, userId))
        {
            throw new HubException("Access denied.");
        }

        var chatMessage = new ChatMessage
        {
            Id = Guid.NewGuid(),
            RoomId = roomId,
            SenderUserId = userId,
            Message = message.Trim(),
            SentAt = DateTime.UtcNow
        };

        _db.ChatMessages.Add(chatMessage);
        await _db.SaveChangesAsync();

        var senderName = Context.User!.Identity?.Name ?? "Unknown";
        await Clients.Group(roomId.ToString()).SendAsync("ReceiveMessage", new
        {
            roomId,
            messageId = chatMessage.Id,
            senderUserId = userId,
            senderName,
            message = chatMessage.Message,
            sentAt = chatMessage.SentAt
        });
    }

    private async Task<bool> CanAccessRoomAsync(Guid roomId, Guid userId)
    {
        var room = await _db.ChatRooms
            .Include(r => r.Ticket)
            .FirstOrDefaultAsync(r => r.Id == roomId && !r.IsClosed);

        if (room is null)
        {
            return false;
        }

        if (room.Ticket.CreatedByUserId == userId)
        {
            return true;
        }

        var roles = await _db.UserRoles
            .Where(ur => ur.UserId == userId)
            .Join(_db.Roles, ur => ur.RoleId, r => r.Id, (_, role) => role.Name!)
            .ToListAsync();

        return roles.Contains("Admin") || roles.Contains("Author");
    }
}
