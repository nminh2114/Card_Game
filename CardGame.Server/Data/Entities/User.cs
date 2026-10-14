using System;
using System.ComponentModel.DataAnnotations;

namespace CardGame.Server.Data.Entities
{
    public class User
    {
        [Key]
        public string Id { get; set; } = Guid.NewGuid().ToString();
        
        [Required]
        [MaxLength(50)]
        public string Username { get; set; } = string.Empty;
        
        [Required]
        public string PasswordHash { get; set; } = string.Empty;

        public Wallet Wallet { get; set; } = null!;

        public string Role { get; set; } = "user";

        public bool IsBanned { get; set; } = false;

        public DateTime? BannedUntil { get; set; }

        public string? BanReason { get; set; }
    }
}
