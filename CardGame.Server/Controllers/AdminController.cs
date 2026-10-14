using System;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CardGame.Server.Data;
using CardGame.Server.Data.Entities;
using CardGame.Server.Services;

namespace CardGame.Server.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AdminController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly WalletService _walletService;
        private readonly AuthService _authService;
        private readonly RoomService _roomService;

        public AdminController(
            AppDbContext context,
            WalletService walletService,
            AuthService authService,
            RoomService roomService)
        {
            _context = context;
            _walletService = walletService;
            _authService = authService;
            _roomService = roomService;
        }

        public class AdjustBalanceRequest
        {
            public string UserId { get; set; } = string.Empty;
            public int Amount { get; set; }
        }

        public class BanUserRequest
        {
            public string UserId { get; set; } = string.Empty;
            public int Days { get; set; } // 0 = permanent
            public string Reason { get; set; } = "Vi phạm quy định hệ thống";
        }

        public class UnbanUserRequest
        {
            public string UserId { get; set; } = string.Empty;
        }

        public class DepositActionRequest
        {
            public string DepositId { get; set; } = string.Empty;
            public string? Reason { get; set; }
        }

        public class KickPlayerRequest
        {
            public string TableId { get; set; } = string.Empty;
            public string UserId { get; set; } = string.Empty;
        }

        public class CloseTableRequest
        {
            public string TableId { get; set; } = string.Empty;
        }

        // Initialize admin account if not exists
        [HttpPost("init")]
        public async Task<IActionResult> EnsureAdmin()
        {
            var adminUser = await _context.Users.Include(u => u.Wallet).FirstOrDefaultAsync(u => u.Username == "admin");
            if (adminUser == null)
            {
                adminUser = await _authService.RegisterAsync("admin", "Admin123!");
                if (adminUser != null)
                {
                    adminUser.Role = "admin";
                    await _walletService.UpdateBalanceAsync(adminUser.Id, 9990000);
                    await _context.SaveChangesAsync();
                }
            }
            else if (adminUser.Role != "admin")
            {
                adminUser.Role = "admin";
                await _context.SaveChangesAsync();
            }

            return Ok(new
            {
                Message = "Tài khoản Admin đã sẵn sàng.",
                Username = "admin",
                DefaultPassword = "Admin123!"
            });
        }

        // Get system overview statistics
        [HttpGet("stats")]
        public async Task<IActionResult> GetSystemStats()
        {
            await EnsureAdmin();

            var totalUsers = await _context.Users.CountAsync();
            var totalChips = await _context.Wallets.SumAsync(w => (long)w.Balance);
            var pendingDepositsCount = await _context.DepositRequests.CountAsync(d => d.Status == "Pending");
            var bannedUsersCount = await _context.Users.CountAsync(u => u.IsBanned);
            var activeTables = _roomService.GetAllTables().ToList();
            var activePlayersInTables = activeTables.Sum(t => t.Players.Count);

            return Ok(new
            {
                TotalUsers = totalUsers,
                TotalChipsInCirculation = totalChips,
                PendingDepositsCount = pendingDepositsCount,
                BannedUsersCount = bannedUsersCount,
                ActiveTables = activeTables.Count,
                ActivePlayers = activePlayersInTables,
                ServerStatus = "Online"
            });
        }

        // ==========================================
        // 1. DEPOSIT APPROVAL MANAGEMENT
        // ==========================================
        [HttpGet("deposits")]
        public async Task<IActionResult> GetDeposits([FromQuery] string? status)
        {
            var query = _context.DepositRequests.AsQueryable();
            if (!string.IsNullOrWhiteSpace(status) && status != "All")
            {
                query = query.Where(d => d.Status == status);
            }

            var list = await query
                .OrderByDescending(d => d.CreatedAt)
                .Take(100)
                .ToListAsync();

            return Ok(list);
        }

        [HttpPost("deposits/approve")]
        public async Task<IActionResult> ApproveDeposit([FromBody] DepositActionRequest req)
        {
            var deposit = await _context.DepositRequests.FirstOrDefaultAsync(d => d.Id == req.DepositId);
            if (deposit == null) return NotFound(new { Message = "Không tìm thấy yêu cầu nạp tiền." });

            if (deposit.Status != "Pending")
            {
                return BadRequest(new { Message = $"Yêu cầu đã được xử lý trước đó ({deposit.Status})." });
            }

            // Credit chips with ACID transaction
            var (success, newBalance, message) = await _walletService.UpdateBalanceAsync(deposit.UserId, deposit.Amount);
            if (!success)
            {
                return BadRequest(new { Message = $"Cộng chip thất bại: {message}" });
            }

            deposit.Status = "Approved";
            deposit.ProcessedAt = DateTime.UtcNow;
            deposit.ProcessedBy = "admin";

            // Log action
            _context.AuditLogs.Add(new AuditLog
            {
                AdminUsername = "admin",
                ActionType = "APPROVE_DEPOSIT",
                TargetUser = deposit.Username,
                Details = $"Duyệt nạp {deposit.Amount:N0} chip (Mã GD: {deposit.TransferCode}). Số dư mới: {newBalance:N0} chip.",
                CreatedAt = DateTime.UtcNow
            });

            await _context.SaveChangesAsync();

            return Ok(new
            {
                Success = true,
                Message = $"Đã duyệt nạp {deposit.Amount:N0} chip cho {deposit.Username}. Số dư mới: {newBalance:N0} chip.",
                NewBalance = newBalance
            });
        }

        [HttpPost("deposits/reject")]
        public async Task<IActionResult> RejectDeposit([FromBody] DepositActionRequest req)
        {
            var deposit = await _context.DepositRequests.FirstOrDefaultAsync(d => d.Id == req.DepositId);
            if (deposit == null) return NotFound(new { Message = "Không tìm thấy yêu cầu nạp tiền." });

            if (deposit.Status != "Pending")
            {
                return BadRequest(new { Message = $"Yêu cầu đã được xử lý trước đó ({deposit.Status})." });
            }

            deposit.Status = "Rejected";
            deposit.RejectReason = req.Reason ?? "Không khớp giao dịch hoặc sai nội dung chuyển khoản.";
            deposit.ProcessedAt = DateTime.UtcNow;
            deposit.ProcessedBy = "admin";

            // Log action
            _context.AuditLogs.Add(new AuditLog
            {
                AdminUsername = "admin",
                ActionType = "REJECT_DEPOSIT",
                TargetUser = deposit.Username,
                Details = $"Từ chối nạp {deposit.Amount:N0} chip (Mã GD: {deposit.TransferCode}). Lý do: {deposit.RejectReason}",
                CreatedAt = DateTime.UtcNow
            });

            await _context.SaveChangesAsync();

            return Ok(new
            {
                Success = true,
                Message = $"Đã từ chối yêu cầu nạp của {deposit.Username}."
            });
        }

        // ==========================================
        // 2. USER MANAGEMENT & BAN
        // ==========================================
        [HttpGet("users")]
        public async Task<IActionResult> GetUsers([FromQuery] string? search)
        {
            var query = _context.Users.Include(u => u.Wallet).AsQueryable();

            if (!string.IsNullOrWhiteSpace(search))
            {
                query = query.Where(u => u.Username.ToLower().Contains(search.ToLower()));
            }

            var users = await query
                .OrderByDescending(u => u.Id)
                .Select(u => new
                {
                    u.Id,
                    u.Username,
                    Balance = u.Wallet != null ? u.Wallet.Balance : 0,
                    u.Role,
                    IsAdmin = u.Role == "admin" || u.Username == "admin",
                    u.IsBanned,
                    u.BannedUntil,
                    u.BanReason
                })
                .ToListAsync();

            return Ok(users);
        }

        // Adjust chips for any user with ACID protection
        [HttpPost("adjust-balance")]
        public async Task<IActionResult> AdjustBalance([FromBody] AdjustBalanceRequest req)
        {
            if (string.IsNullOrEmpty(req.UserId))
            {
                return BadRequest(new { Message = "UserId không được để trống." });
            }

            var targetUser = await _context.Users.FindAsync(req.UserId);
            var (success, newBalance, message) = await _walletService.UpdateBalanceAsync(req.UserId, req.Amount);
            if (!success)
            {
                return BadRequest(new { Success = false, Message = message });
            }

            _context.AuditLogs.Add(new AuditLog
            {
                AdminUsername = "admin",
                ActionType = "ADJUST_BALANCE",
                TargetUser = targetUser?.Username ?? req.UserId,
                Details = $"Điều chỉnh số dư {req.Amount:+#,##0;-#,##0;0} chip. Số dư mới: {newBalance:N0} chip.",
                CreatedAt = DateTime.UtcNow
            });
            await _context.SaveChangesAsync();

            return Ok(new
            {
                Success = true,
                Message = $"Đã cập nhật số dư thành công. Số dư mới: {newBalance:N0} chip.",
                NewBalance = newBalance
            });
        }

        [HttpPost("ban")]
        public async Task<IActionResult> BanUser([FromBody] BanUserRequest req)
        {
            var user = await _context.Users.FindAsync(req.UserId);
            if (user == null) return NotFound(new { Message = "Không tìm thấy người chơi." });

            if (user.Role == "admin" || user.Username == "admin")
            {
                return BadRequest(new { Message = "Không thể khóa tài khoản Quản Trị Viên." });
            }

            user.IsBanned = true;
            user.BanReason = string.IsNullOrWhiteSpace(req.Reason) ? "Vi phạm quy định hệ thống" : req.Reason;
            user.BannedUntil = req.Days > 0 ? DateTime.UtcNow.AddDays(req.Days) : null;

            // Also kick this user from any active table
            foreach (var table in _roomService.GetAllTables())
            {
                _roomService.KickPlayerFromTable(table.TableId, user.Id);
            }

            var durationText = req.Days > 0 ? $"{req.Days} ngày" : "Vĩnh viễn";
            _context.AuditLogs.Add(new AuditLog
            {
                AdminUsername = "admin",
                ActionType = "BAN_USER",
                TargetUser = user.Username,
                Details = $"Khóa tài khoản {durationText}. Lý do: {user.BanReason}",
                CreatedAt = DateTime.UtcNow
            });

            await _context.SaveChangesAsync();

            return Ok(new
            {
                Success = true,
                Message = $"Đã khóa tài khoản {user.Username} ({durationText}). Lý do: {user.BanReason}."
            });
        }

        [HttpPost("unban")]
        public async Task<IActionResult> UnbanUser([FromBody] UnbanUserRequest req)
        {
            var user = await _context.Users.FindAsync(req.UserId);
            if (user == null) return NotFound(new { Message = "Không tìm thấy người chơi." });

            user.IsBanned = false;
            user.BannedUntil = null;
            user.BanReason = null;

            _context.AuditLogs.Add(new AuditLog
            {
                AdminUsername = "admin",
                ActionType = "UNBAN_USER",
                TargetUser = user.Username,
                Details = "Đã mở khóa tài khoản.",
                CreatedAt = DateTime.UtcNow
            });

            await _context.SaveChangesAsync();

            return Ok(new
            {
                Success = true,
                Message = $"Đã mở khóa tài khoản cho {user.Username} thành công."
            });
        }

        // ==========================================
        // 3. TABLE MANAGEMENT & KICK
        // ==========================================
        [HttpGet("tables")]
        public IActionResult GetActiveTables()
        {
            var tables = _roomService.GetAllTables().Select(t => new
            {
                t.TableId,
                t.RoomCode,
                t.MaxPlayers,
                t.MinBuyIn,
                t.State,
                PlayerCount = t.Players.Count,
                Players = t.Players.Select(p => new
                {
                    p.UserId,
                    p.Username,
                    p.Chips,
                    p.SeatIndex
                })
            }).ToList();

            return Ok(tables);
        }

        [HttpPost("kick-player")]
        public async Task<IActionResult> KickPlayer([FromBody] KickPlayerRequest req)
        {
            var kicked = _roomService.KickPlayerFromTable(req.TableId, req.UserId);
            if (!kicked)
            {
                return BadRequest(new { Message = "Không thể kick người chơi hoặc người chơi không còn trong bàn." });
            }

            var user = await _context.Users.FindAsync(req.UserId);
            _context.AuditLogs.Add(new AuditLog
            {
                AdminUsername = "admin",
                ActionType = "KICK_PLAYER",
                TargetUser = user?.Username ?? req.UserId,
                Details = $"Kick khỏi bàn {req.TableId}",
                CreatedAt = DateTime.UtcNow
            });
            await _context.SaveChangesAsync();

            return Ok(new
            {
                Success = true,
                Message = $"Đã kick người chơi {user?.Username ?? req.UserId} ra khỏi bàn."
            });
        }

        [HttpPost("close-table")]
        public async Task<IActionResult> CloseTable([FromBody] CloseTableRequest req)
        {
            var closed = _roomService.CloseTable(req.TableId);
            if (!closed)
            {
                return BadRequest(new { Message = "Bàn chơi không tồn tại hoặc đã đóng." });
            }

            _context.AuditLogs.Add(new AuditLog
            {
                AdminUsername = "admin",
                ActionType = "CLOSE_TABLE",
                TargetUser = "ALL",
                Details = $"Đóng bàn {req.TableId}",
                CreatedAt = DateTime.UtcNow
            });
            await _context.SaveChangesAsync();

            return Ok(new
            {
                Success = true,
                Message = $"Đã giải tán bàn chơi {req.TableId} thành công."
            });
        }

        // ==========================================
        // 4. AUDIT & SYSTEM LOGS
        // ==========================================
        [HttpGet("logs")]
        public async Task<IActionResult> GetAuditLogs()
        {
            var logs = await _context.AuditLogs
                .OrderByDescending(l => l.CreatedAt)
                .Take(50)
                .ToListAsync();

            return Ok(logs);
        }
    }
}
