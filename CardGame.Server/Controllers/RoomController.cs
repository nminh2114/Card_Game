using System;
using System.Collections.Generic;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CardGame.Server.Data;
using CardGame.Server.Services;

namespace CardGame.Server.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class RoomController : ControllerBase
    {
        private readonly RoomService _roomService;
        private readonly WalletService _walletService;
        private readonly AppDbContext _context;

        public RoomController(RoomService roomService, WalletService walletService, AppDbContext context)
        {
            _roomService = roomService;
            _walletService = walletService;
            _context = context;
        }

        public class CreateRoomRequest
        {
            public string GameType { get; set; } = "tala"; // tala, poker, tienlen, sam
            public int Stake { get; set; } = 2000;
            public int MinBuyIn { get; set; } = 20000;
            public int MaxPlayers { get; set; } = 4;
        }

        public class JoinRoomRequest
        {
            public string RoomCode { get; set; } = string.Empty;
        }

        public class PlayCardRequest
        {
            public List<int> CardRawValues { get; set; } = new();
        }

        public class PokerActionRequest
        {
            public string Action { get; set; } = string.Empty; // check, call, raise, fold
            public int Amount { get; set; } = 0;
        }

        [HttpPost("create")]
        public async Task<IActionResult> CreatePrivateRoom([FromBody] CreateRoomRequest req)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            var username = User.FindFirstValue(ClaimTypes.Name) ?? "Player";

            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            var user = await _context.Users.FindAsync(userId);
            var nickname = user?.Nickname ?? username;
            var avatar = user?.Avatar ?? "👤";

            var balance = await _walletService.GetBalanceAsync(userId) ?? 0;
            if (balance < req.MinBuyIn)
            {
                return BadRequest(new { Message = $"Số dư ví ({balance:N0}) không đủ mức cược tối thiểu ({req.MinBuyIn:N0})." });
            }

            var (code, tableId) = await _roomService.CreatePrivateRoomAsync(
                userId, username, nickname, avatar, balance, req.GameType, req.Stake, req.MinBuyIn, req.MaxPlayers);

            return Ok(new
            {
                Message = "Tạo phòng riêng thành công.",
                RoomCode = code,
                TableId = tableId,
                ExpireInMinutes = 15
            });
        }

        [HttpPost("join")]
        public async Task<IActionResult> JoinRoom([FromBody] JoinRoomRequest req)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            var username = User.FindFirstValue(ClaimTypes.Name) ?? "Player";

            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            var user = await _context.Users.FindAsync(userId);
            var nickname = user?.Nickname ?? username;
            var avatar = user?.Avatar ?? "👤";

            var balance = await _walletService.GetBalanceAsync(userId) ?? 0;

            var (success, tableId, message, table) = await _roomService.JoinRoomByCodeAsync(
                req.RoomCode, userId, username, nickname, avatar, balance);

            if (!success)
            {
                return BadRequest(new { Success = false, Message = message });
            }

            return Ok(new
            {
                Success = true,
                Message = message,
                TableId = tableId
            });
        }

        // Synchronization endpoint polled by all players inside the room (every 1.5s)
        [HttpGet("{tableId}/state")]
        public IActionResult GetTableState(string tableId)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            var state = _roomService.GetTableStateForUser(tableId, userId);
            if (state == null)
            {
                return NotFound(new { Message = "Bàn chơi không tồn tại hoặc đã bị giải tán." });
            }

            return Ok(state);
        }

        // Deal cards for a new round (Server deck sequentially to everyone)
        [HttpPost("{tableId}/deal")]
        public IActionResult DealNewRound(string tableId)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            var (success, message) = _roomService.DealNewRound(tableId, userId);
            if (!success) return BadRequest(new { Message = message });

            return Ok(new { Success = true, Message = message });
        }

        // Play cards from hand onto table
        [HttpPost("{tableId}/play-card")]
        public IActionResult PlayCards(string tableId, [FromBody] PlayCardRequest req)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            var (success, message) = _roomService.PlayCards(tableId, userId, req.CardRawValues);
            if (!success) return BadRequest(new { Message = message });

            return Ok(new { Success = true, Message = message });
        }

        // Draw card from deck (Tá Lả)
        [HttpPost("{tableId}/draw-card")]
        public IActionResult DrawCard(string tableId)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            var (success, message, card) = _roomService.DrawCard(tableId, userId);
            if (!success) return BadRequest(new { Message = message });

            return Ok(new { Success = true, Message = message, Card = card });
        }

        // Take card from discard pile (Tá Lả ăn bài)
        [HttpPost("{tableId}/take-card")]
        public IActionResult TakeCard(string tableId)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            var (success, message) = _roomService.TakeCard(tableId, userId);
            if (!success) return BadRequest(new { Message = message });

            return Ok(new { Success = true, Message = message });
        }

        // Pass turn (Bỏ lượt trong Tiến Lên / Sâm Lốc)
        [HttpPost("{tableId}/pass-turn")]
        public IActionResult PassTurn(string tableId)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            var (success, message) = _roomService.PassTurn(tableId, userId);
            if (!success) return BadRequest(new { Message = message });

            return Ok(new { Success = true, Message = message });
        }

        // Poker actions (check, call, raise, fold)
        [HttpPost("{tableId}/poker-action")]
        public IActionResult PokerAction(string tableId, [FromBody] PokerActionRequest req)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            var (success, message) = _roomService.PokerAction(tableId, userId, req.Action, req.Amount);
            if (!success) return BadRequest(new { Message = message });

            return Ok(new { Success = true, Message = message });
        }

        // Leave table
        [HttpPost("{tableId}/leave")]
        public IActionResult LeaveTable(string tableId)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            _roomService.KickPlayerFromTable(tableId, userId);
            return Ok(new { Success = true, Message = "Đã rời khỏi bàn chơi." });
        }

        [HttpGet("{tableId}")]
        public IActionResult GetTableInfo(string tableId)
        {
            var table = _roomService.GetTable(tableId);
            if (table == null) return NotFound(new { Message = "Bàn chơi không tồn tại." });

            return Ok(table);
        }
    }
}
