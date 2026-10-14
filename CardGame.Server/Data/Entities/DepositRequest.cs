using System;
using System.ComponentModel.DataAnnotations;

namespace CardGame.Server.Data.Entities
{
    public class DepositRequest
    {
        [Key]
        public string Id { get; set; } = Guid.NewGuid().ToString();

        [Required]
        public string UserId { get; set; } = string.Empty;

        [Required]
        public string Username { get; set; } = string.Empty;

        [Required]
        public int Amount { get; set; }

        [Required]
        public string TransferCode { get; set; } = string.Empty;

        [Required]
        public string Status { get; set; } = "Pending"; // Pending, Approved, Rejected

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public DateTime? ProcessedAt { get; set; }

        public string? ProcessedBy { get; set; }

        public string? RejectReason { get; set; }
    }
}
