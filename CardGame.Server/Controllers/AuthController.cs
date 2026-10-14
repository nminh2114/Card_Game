using System;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CardGame.Server.Data;
using CardGame.Server.Services;
using BCrypt.Net;

namespace CardGame.Server.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly AuthService _authService;
        private readonly AppDbContext _context;

        public AuthController(AuthService authService, AppDbContext context)
        {
            _authService = authService;
            _context = context;
        }

        public class LoginRequest
        {
            public string Username { get; set; } = string.Empty;
            public string Password { get; set; } = string.Empty;
        }

        public class UpdateProfileRequest
        {
            public string? Avatar { get; set; }
            public string? Nickname { get; set; }
        }

        public class ChangePasswordRequest
        {
            public string CurrentPassword { get; set; } = string.Empty;
            public string NewPassword { get; set; } = string.Empty;
        }

        [HttpPost("register")]
        public async Task<IActionResult> Register([FromBody] LoginRequest req)
        {
            var user = await _authService.RegisterAsync(req.Username, req.Password);
            if (user == null) return BadRequest(new { Message = "Tên đăng nhập đã tồn tại." });
            return Ok(new
            {
                user.Id,
                user.Username,
                InitialChips = 3000,
                Message = "Đăng ký thành công! Bạn nhận được 3.000 chip trải nghiệm."
            });
        }

        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginRequest req)
        {
            var (token, user, errorMessage) = await _authService.LoginAsync(req.Username, req.Password);
            if (token == null)
            {
                return BadRequest(new { Message = errorMessage ?? "Đăng nhập thất bại." });
            }
            return Ok(new
            {
                Token = token,
                UserId = user?.Id,
                Username = user?.Username,
                Avatar = user?.Avatar ?? "👤",
                Nickname = user?.Nickname ?? user?.Username,
                Role = user?.Role ?? "user"
            });
        }

        [HttpGet("profile")]
        [Authorize]
        public async Task<IActionResult> GetProfile()
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            var user = await _context.Users.Include(u => u.Wallet).FirstOrDefaultAsync(u => u.Id == userId);
            if (user == null) return NotFound(new { Message = "Không tìm thấy người dùng." });

            return Ok(new
            {
                UserId = user.Id,
                Username = user.Username,
                Nickname = user.Nickname ?? user.Username,
                Avatar = user.Avatar ?? "👤",
                Role = user.Role,
                Balance = user.Wallet != null ? user.Wallet.Balance : 0,
                CreatedAt = user.CreatedAt
            });
        }

        [HttpPost("profile/update")]
        [Authorize]
        public async Task<IActionResult> UpdateProfile([FromBody] UpdateProfileRequest req)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            var user = await _context.Users.FindAsync(userId);
            if (user == null) return NotFound(new { Message = "Không tìm thấy người dùng." });

            if (!string.IsNullOrWhiteSpace(req.Avatar))
            {
                user.Avatar = req.Avatar.Trim();
            }

            if (req.Nickname != null)
            {
                user.Nickname = req.Nickname.Trim();
            }

            await _context.SaveChangesAsync();

            return Ok(new
            {
                Success = true,
                Message = "Cập nhật thông tin hồ sơ thành công!",
                user.Avatar,
                Nickname = user.Nickname ?? user.Username
            });
        }

        [HttpPost("profile/change-password")]
        [Authorize]
        public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest req)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            if (string.IsNullOrWhiteSpace(req.NewPassword) || req.NewPassword.Length < 6)
            {
                return BadRequest(new { Message = "Mật khẩu mới phải có ít nhất 6 ký tự." });
            }

            var user = await _context.Users.FindAsync(userId);
            if (user == null) return NotFound(new { Message = "Không tìm thấy người dùng." });

            if (!BCrypt.Net.BCrypt.Verify(req.CurrentPassword, user.PasswordHash))
            {
                return BadRequest(new { Message = "Mật khẩu hiện tại không chính xác." });
            }

            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);
            await _context.SaveChangesAsync();

            return Ok(new
            {
                Success = true,
                Message = "Đổi mật khẩu thành công! Vui lòng sử dụng mật khẩu mới cho lần đăng nhập sau."
            });
        }
    }
}
