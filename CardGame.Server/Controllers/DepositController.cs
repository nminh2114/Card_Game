using System;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CardGame.Server.Data;
using CardGame.Server.Data.Entities;

namespace CardGame.Server.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class DepositController : ControllerBase
    {
        private readonly AppDbContext _context;

        public DepositController(AppDbContext context)
        {
            _context = context;
        }

        public class CreateDepositRequest
        {
            public int Amount { get; set; }
            public string TransferCode { get; set; } = string.Empty;
        }

        // User submits a deposit request after scanning QR
        [HttpPost("request")]
        [Authorize]
        public async Task<IActionResult> SubmitDepositRequest([FromBody] CreateDepositRequest req)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            var username = User.FindFirstValue(ClaimTypes.Name) ?? "Player";

            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            if (req.Amount < 10000)
            {
                return BadRequest(new { Message = "Số tiền nạp tối thiểu là 10.000 VNĐ." });
            }

            var deposit = new DepositRequest
            {
                UserId = userId,
                Username = username,
                Amount = req.Amount,
                TransferCode = string.IsNullOrWhiteSpace(req.TransferCode) ? $"NAP {username}" : req.TransferCode,
                Status = "Pending",
                CreatedAt = DateTime.UtcNow
            };

            _context.DepositRequests.Add(deposit);
            await _context.SaveChangesAsync();

            return Ok(new
            {
                Success = true,
                Message = "Đã gửi yêu cầu nạp tiền! Đang chờ Admin xác nhận giao dịch để cộng chip.",
                Deposit = new
                {
                    deposit.Id,
                    deposit.Amount,
                    deposit.TransferCode,
                    deposit.Status,
                    deposit.CreatedAt
                }
            });
        }

        // User gets their own recent deposit requests
        [HttpGet("my-requests")]
        [Authorize]
        public async Task<IActionResult> GetMyRequests()
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            var list = await _context.DepositRequests
                .Where(d => d.UserId == userId)
                .OrderByDescending(d => d.CreatedAt)
                .Take(10)
                .Select(d => new
                {
                    d.Id,
                    d.Amount,
                    d.TransferCode,
                    d.Status,
                    d.CreatedAt,
                    d.ProcessedAt,
                    d.RejectReason
                })
                .ToListAsync();

            return Ok(list);
        }
    }
}
