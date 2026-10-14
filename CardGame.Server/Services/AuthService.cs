using System;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using CardGame.Server.Data;
using CardGame.Server.Data.Entities;
using BCrypt.Net;

namespace CardGame.Server.Services
{
    public class AuthService
    {
        private readonly AppDbContext _context;
        private readonly IConfiguration _configuration;

        public AuthService(AppDbContext context, IConfiguration configuration)
        {
            _context = context;
            _configuration = configuration;
        }

        public async Task<User?> RegisterAsync(string username, string password)
        {
            if (await _context.Users.AnyAsync(u => u.Username == username))
            {
                return null;
            }

            var user = new User
            {
                Username = username,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(password),
                Wallet = new Wallet { Balance = 10000 } // Initial balance
            };

            _context.Users.Add(user);
            await _context.SaveChangesAsync();

            return user;
        }

        public async Task<(string? Token, User? User, string? ErrorMessage)> LoginAsync(string username, string password)
        {
            var user = await _context.Users.SingleOrDefaultAsync(u => u.Username == username);
            if (user == null || !BCrypt.Net.BCrypt.Verify(password, user.PasswordHash))
            {
                return (null, null, "Tài khoản hoặc mật khẩu không chính xác.");
            }

            // Check if user is banned
            if (user.IsBanned)
            {
                if (user.BannedUntil == null)
                {
                    return (null, user, $"Tài khoản của bạn đã bị KHÓA VĨNH VIỄN vì vi phạm quy định. Lý do: {user.BanReason ?? "Gian lận hệ thống"}. Vui lòng liên hệ Admin.");
                }
                else if (user.BannedUntil > DateTime.UtcNow)
                {
                    var expireLocal = user.BannedUntil.Value.ToLocalTime().ToString("dd/MM/yyyy HH:mm");
                    return (null, user, $"Tài khoản bị TẠM KHÓA đến {expireLocal}. Lý do: {user.BanReason ?? "Nghi vấn gian lận"}. Vui lòng liên hệ Admin.");
                }
                else
                {
                    // Ban period has expired -> auto unban
                    user.IsBanned = false;
                    user.BannedUntil = null;
                    user.BanReason = null;
                    await _context.SaveChangesAsync();
                }
            }

            var tokenHandler = new JwtSecurityTokenHandler();
            var jwtKey = _configuration["Jwt:Key"] ?? "SuperSecretKeyForJwtCardGame2026VeryLongStringMin32Chars!";
            var key = Encoding.UTF8.GetBytes(jwtKey);
            var tokenDescriptor = new SecurityTokenDescriptor
            {
                Subject = new ClaimsIdentity(new[]
                {
                    new Claim(ClaimTypes.NameIdentifier, user.Id),
                    new Claim(ClaimTypes.Name, user.Username),
                    new Claim(ClaimTypes.Role, user.Role ?? "user"),
                    new Claim("role", user.Role ?? "user")
                }),
                Expires = DateTime.UtcNow.AddDays(7),
                SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(key), SecurityAlgorithms.HmacSha256Signature)
            };
            var token = tokenHandler.CreateToken(tokenDescriptor);
            return (tokenHandler.WriteToken(token), user, null);
        }
    }
}
