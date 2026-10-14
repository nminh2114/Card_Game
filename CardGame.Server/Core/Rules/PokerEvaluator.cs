using System;
using System.Collections.Generic;
using System.Linq;
using CardGame.Server.Core.Models;

namespace CardGame.Server.Core.Rules
{
    public enum PokerHandRank
    {
        HighCard = 1,
        Pair = 2,
        TwoPair = 3,
        ThreeOfAKind = 4,
        Straight = 5,
        Flush = 6,
        FullHouse = 7,
        FourOfAKind = 8,
        StraightFlush = 9,
        RoyalFlush = 10
    }

    public static class PokerEvaluator
    {
        public static PokerHandRank Evaluate(IReadOnlyList<Card> cards)
        {
            if (cards == null || cards.Count < 5)
                throw new ArgumentException("Need at least 5 cards to evaluate poker hand.", nameof(cards));

            if (cards.Count == 5)
            {
                return Evaluate5Cards(cards);
            }

            // If 6 or 7 cards (standard Texas Hold'em has 7 cards: 2 hole + 5 community),
            // evaluate all combinations of 5 cards and pick the highest rank.
            PokerHandRank bestRank = PokerHandRank.HighCard;
            var combinations = GetCombinations(cards.ToList(), 5);

            foreach (var combo in combinations)
            {
                var rank = Evaluate5Cards(combo);
                if (rank > bestRank)
                {
                    bestRank = rank;
                    if (bestRank == PokerHandRank.RoyalFlush) break; // Maximum reached
                }
            }

            return bestRank;
        }

        public static PokerHandRank Evaluate5Cards(IReadOnlyList<Card> cards)
        {
            if (cards.Count != 5) throw new ArgumentException("Must pass exactly 5 cards.");

            // Standardize ranks: Ace = 14, 2 = 2, ..., King = 13
            int[] ranks = cards.Select(c => c.Rank == 1 ? 14 : (int)c.Rank).OrderByDescending(r => r).ToArray();
            byte[] suits = cards.Select(c => c.Suit).ToArray();

            bool isFlush = suits[0] == suits[1] && suits[1] == suits[2] && suits[2] == suits[3] && suits[3] == suits[4];
            bool isStraight = false;
            bool isAceLowStraight = false;

            // Normal straight: 5 consecutive descending ranks
            if (ranks[0] - ranks[1] == 1 &&
                ranks[1] - ranks[2] == 1 &&
                ranks[2] - ranks[3] == 1 &&
                ranks[3] - ranks[4] == 1)
            {
                isStraight = true;
            }
            // Ace-low straight (Wheel): 14, 5, 4, 3, 2 (A-2-3-4-5)
            else if (ranks[0] == 14 && ranks[1] == 5 && ranks[2] == 4 && ranks[3] == 3 && ranks[4] == 2)
            {
                isStraight = true;
                isAceLowStraight = true;
            }

            if (isFlush && isStraight)
            {
                if (ranks[0] == 14 && !isAceLowStraight && ranks[1] == 13)
                {
                    return PokerHandRank.RoyalFlush;
                }
                return PokerHandRank.StraightFlush;
            }

            // Frequency counts for Four of a kind, Full house, Three of a kind, Pairs
            var counts = new Dictionary<int, int>(5);
            foreach (var r in ranks)
            {
                counts[r] = counts.TryGetValue(r, out int cnt) ? cnt + 1 : 1;
            }

            var groupCounts = counts.Values.OrderByDescending(c => c).ToArray();

            if (groupCounts[0] == 4) return PokerHandRank.FourOfAKind;
            if (groupCounts[0] == 3 && groupCounts[1] == 2) return PokerHandRank.FullHouse;
            if (isFlush) return PokerHandRank.Flush;
            if (isStraight) return PokerHandRank.Straight;
            if (groupCounts[0] == 3) return PokerHandRank.ThreeOfAKind;
            if (groupCounts[0] == 2 && groupCounts[1] == 2) return PokerHandRank.TwoPair;
            if (groupCounts[0] == 2) return PokerHandRank.Pair;

            return PokerHandRank.HighCard;
        }

        private static List<List<T>> GetCombinations<T>(List<T> list, int length)
        {
            var result = new List<List<T>>();
            void Combine(int start, List<T> current)
            {
                if (current.Count == length)
                {
                    result.Add(new List<T>(current));
                    return;
                }
                for (int i = start; i < list.Count; i++)
                {
                    current.Add(list[i]);
                    Combine(i + 1, current);
                    current.RemoveAt(current.Count - 1);
                }
            }
            Combine(0, new List<T>(length));
            return result;
        }
    }
}
