using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using CardGame.Server.Services;

namespace CardGame.Server.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly AuthService _authService;

        public AuthController(AuthService authService)
        {
            _authService = authService;
        }

        public class LoginRequest
        {
            public string Username { get; set; } = string.Empty;
            public string Password { get; set; } = string.Empty;
        }

        [HttpPost("register")]
        public async Task<IActionResult> Register([FromBody] LoginRequest req)
        {
            var user = await _authService.RegisterAsync(req.Username, req.Password);
            if (user == null) return BadRequest("Username already exists.");
            return Ok(new { user.Id, user.Username });
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
                Role = user?.Role ?? "user"
            });
        }
    }
}
