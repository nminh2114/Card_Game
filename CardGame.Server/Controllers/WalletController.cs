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
    public class WalletController : ControllerBase
    {
        private readonly WalletService _walletService;

        public WalletController(WalletService walletService)
        {
            _walletService = walletService;
        }

        public class BalanceUpdateRequest
        {
            public int Amount { get; set; }
        }

        [HttpGet("balance")]
        public async Task<IActionResult> GetBalance()
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            var balance = await _walletService.GetBalanceAsync(userId);
            if (balance == null) return NotFound(new { Message = "Không tìm thấy ví người dùng." });

            return Ok(new { UserId = userId, Balance = balance.Value });
        }

        [HttpPost("transfer")]
        public async Task<IActionResult> TransferChips([FromBody] BalanceUpdateRequest req)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            var (success, newBalance, message) = await _walletService.UpdateBalanceAsync(userId, req.Amount);
            if (!success)
            {
                return BadRequest(new { Success = false, Message = message });
            }

            return Ok(new
            {
                Success = true,
                Message = message,
                NewBalance = newBalance
            });
        }
    }
}
