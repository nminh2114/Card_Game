using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
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

        public RoomController(RoomService roomService, WalletService walletService)
        {
            _roomService = roomService;
            _walletService = walletService;
        }

        public class CreateRoomRequest
        {
            public int MaxPlayers { get; set; } = 4;
            public int MinBuyIn { get; set; } = 1000;
        }

        public class JoinRoomRequest
        {
            public string RoomCode { get; set; } = string.Empty;
        }

        [HttpPost("create")]
        public async Task<IActionResult> CreatePrivateRoom([FromBody] CreateRoomRequest req)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            var username = User.FindFirstValue(ClaimTypes.Name) ?? "Player";

            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            var balance = await _walletService.GetBalanceAsync(userId) ?? 0;
            if (balance < req.MinBuyIn)
            {
                return BadRequest(new { Message = $"Số dư ví ({balance}) không đủ mức cược tối thiểu ({req.MinBuyIn})." });
            }

            var (code, tableId) = await _roomService.CreatePrivateRoomAsync(
                userId, username, balance, req.MaxPlayers, req.MinBuyIn);

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

            var balance = await _walletService.GetBalanceAsync(userId) ?? 0;

            var (success, tableId, message, table) = await _roomService.JoinRoomByCodeAsync(
                req.RoomCode, userId, username, balance);

            if (!success)
            {
                return BadRequest(new { Success = false, Message = message });
            }

            return Ok(new
            {
                Success = true,
                Message = message,
                TableId = tableId,
                Table = new
                {
                    table!.TableId,
                    table.RoomCode,
                    table.MaxPlayers,
                    table.MinBuyIn,
                    table.State,
                    Players = table.Players.Select(p => new
                    {
                        p.UserId,
                        p.Username,
                        p.Chips,
                        p.SeatIndex
                    })
                }
            });
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
