using System;
using System.ComponentModel.DataAnnotations;

namespace CardGame.Server.Data.Entities
{
    public class AuditLog
    {
        [Key]
        public string Id { get; set; } = Guid.NewGuid().ToString();

        [Required]
        public string AdminUsername { get; set; } = "admin";

        [Required]
        public string ActionType { get; set; } = string.Empty; // APPROVE_DEPOSIT, REJECT_DEPOSIT, ADJUST_BALANCE, BAN_USER, UNBAN_USER, KICK_PLAYER

        [Required]
        public string TargetUser { get; set; } = string.Empty;

        public string Details { get; set; } = string.Empty;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
