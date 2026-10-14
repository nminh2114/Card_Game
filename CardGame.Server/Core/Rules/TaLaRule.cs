using System;
using System.Collections.Generic;
using System.Linq;
using CardGame.Server.Core.Models;

namespace CardGame.Server.Core.Rules
{
    public class PhomResult
    {
        public List<List<Card>> BestPhoms { get; set; } = new();
        public List<Card> TrashCards { get; set; } = new();
        public int MinTrashScore { get; set; }

        public override string ToString() =>
            $"Phoms: {BestPhoms.Count}, Trash Score: {MinTrashScore} (Trash: [{string.Join(", ", TrashCards)}])";
    }

    public static class TaLaRule
    {
        public static PhomResult FindBestPhomCombination(IReadOnlyList<Card> hand)
        {
            if (hand == null || hand.Count == 0)
            {
                return new PhomResult { MinTrashScore = 0 };
            }

            var allCandidates = FindAllCandidatePhoms(hand);

            var bestPhoms = new List<List<Card>>();
            int bestTrashScore = CalculateTrashScore(hand);
            int maxPhomCardsCount = 0;

            // Backtracking to explore subsets of disjoint Phom candidates
            void Backtrack(int startIndex, List<List<Card>> currentPhoms, HashSet<byte> usedCardBytes)
            {
                // Calculate current trash score
                var remainingCards = hand.Where(c => !usedCardBytes.Contains(c.RawValue)).ToList();
                int currentTrashScore = CalculateTrashScore(remainingCards);
                int currentPhomCardsCount = hand.Count - remainingCards.Count;

                if (currentTrashScore < bestTrashScore ||
                    (currentTrashScore == bestTrashScore && currentPhomCardsCount > maxPhomCardsCount))
                {
                    bestTrashScore = currentTrashScore;
                    maxPhomCardsCount = currentPhomCardsCount;
                    bestPhoms = currentPhoms.Select(p => p.ToList()).ToList();
                }

                for (int i = startIndex; i < allCandidates.Count; i++)
                {
                    var candidate = allCandidates[i];

                    // Check if candidate overlaps with already used cards
                    bool hasOverlap = false;
                    foreach (var card in candidate)
                    {
                        if (usedCardBytes.Contains(card.RawValue))
                        {
                            hasOverlap = true;
                            break;
                        }
                    }

                    if (hasOverlap) continue;

                    // Choose
                    foreach (var card in candidate) usedCardBytes.Add(card.RawValue);
                    currentPhoms.Add(candidate);

                    // Recurse
                    Backtrack(i + 1, currentPhoms, usedCardBytes);

                    // Backtrack
                    currentPhoms.RemoveAt(currentPhoms.Count - 1);
                    foreach (var card in candidate) usedCardBytes.Remove(card.RawValue);
                }
            }

            Backtrack(0, new List<List<Card>>(), new HashSet<byte>());

            var finalUsed = new HashSet<byte>(bestPhoms.SelectMany(p => p).Select(c => c.RawValue));
            var finalTrash = hand.Where(c => !finalUsed.Contains(c.RawValue)).ToList();

            return new PhomResult
            {
                BestPhoms = bestPhoms,
                TrashCards = finalTrash,
                MinTrashScore = bestTrashScore
            };
        }

        public static List<List<Card>> FindAllCandidatePhoms(IReadOnlyList<Card> hand)
        {
            var candidates = new List<List<Card>>();

            // 1. Phom Sáp (3 or 4 cards with identical rank)
            var rankGroups = hand.GroupBy(c => c.Rank).Where(g => g.Count() >= 3);
            foreach (var group in rankGroups)
            {
                var cards = group.ToList();
                if (cards.Count == 3)
                {
                    candidates.Add(cards);
                }
                else if (cards.Count == 4)
                {
                    // 4-card phom
                    candidates.Add(cards);
                    // Also 3-card combinations
                    candidates.Add(new List<Card> { cards[0], cards[1], cards[2] });
                    candidates.Add(new List<Card> { cards[0], cards[1], cards[3] });
                    candidates.Add(new List<Card> { cards[0], cards[2], cards[3] });
                    candidates.Add(new List<Card> { cards[1], cards[2], cards[3] });
                }
            }

            // 2. Phom Sảnh (3 or more consecutive ranks of same suit)
            var suitGroups = hand.GroupBy(c => c.Suit);
            foreach (var group in suitGroups)
            {
                var sorted = group.OrderBy(c => c.Rank).ToList();
                // Find all consecutive subsegments of length >= 3
                for (int i = 0; i < sorted.Count; i++)
                {
                    var run = new List<Card> { sorted[i] };
                    for (int j = i + 1; j < sorted.Count; j++)
                    {
                        if (sorted[j].Rank == run[^1].Rank + 1)
                        {
                            run.Add(sorted[j]);
                            if (run.Count >= 3)
                            {
                                candidates.Add(run.ToList());
                            }
                        }
                        else
                        {
                            break;
                        }
                    }
                }
            }

            return candidates;
        }

        public static int CalculateTrashScore(IEnumerable<Card> cards)
        {
            // A=1, 2=2, ..., 10=10, J=11, Q=12, K=13
            return cards.Sum(c => (int)c.Rank);
        }
    }
}
