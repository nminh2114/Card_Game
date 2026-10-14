using System;
using System.Collections.Generic;
using System.Linq;

namespace CardGame.Server.Core.Rules
{
    public class PlayerBet
    {
        public string PlayerId { get; set; } = string.Empty;
        public int Amount { get; set; }
        public bool IsFolded { get; set; }

        public PlayerBet() { }

        public PlayerBet(string playerId, int amount, bool isFolded = false)
        {
            PlayerId = playerId;
            Amount = amount;
            IsFolded = isFolded;
        }
    }

    public class Pot
    {
        public string Name { get; set; } = string.Empty; // e.g. "Main Pot", "Side Pot 1"
        public int Amount { get; set; }
        public List<string> EligiblePlayers { get; set; } = new();

        public override string ToString() => $"{Name}: {Amount} chips (Eligible: {string.Join(", ", EligiblePlayers)})";
    }

    public static class PotSplitter
    {
        public static List<Pot> SplitPots(IReadOnlyList<PlayerBet> originalBets)
        {
            if (originalBets == null || originalBets.Count == 0)
                return new List<Pot>();

            // Create working copies to avoid modifying caller's data
            var bets = originalBets
                .Where(b => b.Amount > 0)
                .Select(b => new PlayerBet(b.PlayerId, b.Amount, b.IsFolded))
                .ToList();

            var pots = new List<Pot>();
            int potIndex = 0;

            while (bets.Any(b => b.Amount > 0))
            {
                // Find minimum non-zero bet among remaining players
                int minContribution = bets.Where(b => b.Amount > 0).Min(b => b.Amount);

                var pot = new Pot
                {
                    Name = potIndex == 0 ? "Main Pot" : $"Side Pot {potIndex}",
                    Amount = 0
                };

                foreach (var bet in bets)
                {
                    if (bet.Amount > 0)
                    {
                        pot.Amount += minContribution;
                        bet.Amount -= minContribution;

                        // Only non-folded players who contributed to this pot layer are eligible
                        if (!bet.IsFolded && !pot.EligiblePlayers.Contains(bet.PlayerId))
                        {
                            pot.EligiblePlayers.Add(bet.PlayerId);
                        }
                    }
                }

                // If no active players are eligible for this pot (all folded),
                // the chips go to the last active pot or the remaining un-folded player
                if (pot.EligiblePlayers.Count == 0 && pots.Count > 0)
                {
                    pots[^1].Amount += pot.Amount;
                }
                else
                {
                    pots.Add(pot);
                    potIndex++;
                }
            }

            return pots;
        }
    }
}
