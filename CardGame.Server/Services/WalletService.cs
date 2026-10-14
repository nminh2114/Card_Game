using System;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using CardGame.Server.Data;

namespace CardGame.Server.Services
{
    public class WalletService
    {
        private readonly AppDbContext _context;

        public WalletService(AppDbContext context)
        {
            _context = context;
        }

        public async Task<int?> GetBalanceAsync(string userId)
        {
            var wallet = await _context.Wallets.AsNoTracking().FirstOrDefaultAsync(w => w.UserId == userId);
            return wallet?.Balance;
        }

        /// <summary>
        /// Update wallet balance using database transaction (ACID) to prevent race conditions.
        /// </summary>
        public async Task<(bool Success, int NewBalance, string Message)> UpdateBalanceAsync(string userId, int amountChange)
        {
            // Begin explicit ACID transaction
            await using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                var wallet = await _context.Wallets.FirstOrDefaultAsync(w => w.UserId == userId);
                if (wallet == null)
                {
                    await transaction.RollbackAsync();
                    return (false, 0, "Wallet not found.");
                }

                if (wallet.Balance + amountChange < 0)
                {
                    await transaction.RollbackAsync();
                    return (false, wallet.Balance, "Insufficient funds.");
                }

                wallet.Balance += amountChange;
                await _context.SaveChangesAsync();
                await transaction.CommitAsync();

                return (true, wallet.Balance, "Transaction succeeded.");
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                return (false, 0, $"Transaction failed: {ex.Message}");
            }
        }
    }
}
