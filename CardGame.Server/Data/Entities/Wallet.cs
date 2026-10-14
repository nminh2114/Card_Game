using System.ComponentModel.DataAnnotations;

namespace CardGame.Server.Data.Entities
{
    public class Wallet
    {
        [Key]
        public string UserId { get; set; } = string.Empty;
        public int Balance { get; set; } = 0;

        public User User { get; set; } = null!;
    }
}
