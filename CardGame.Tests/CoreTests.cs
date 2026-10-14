using System.Collections.Generic;
using System.Linq;
using Xunit;
using CardGame.Server.Core.Models;
using CardGame.Server.Core.Rules;

namespace CardGame.Tests
{
    public class CoreTests
    {
        [Fact]
        public void Card_BitwiseEncoding_PreservesRankAndSuit()
        {
            // Rank: 1 to 13 (Ace to King)
            // Suit: 0 (Spade), 1 (Club), 2 (Diamond), 3 (Heart)
            for (byte suit = 0; suit < 4; suit++)
            {
                for (byte rank = 1; rank <= 13; rank++)
                {
                    var card = new Card(rank, suit);
                    Assert.Equal(rank, card.Rank);
                    Assert.Equal(suit, card.Suit);

                    // Validate raw byte decoding
                    var decoded = new Card(card.RawValue);
                    Assert.Equal(card, decoded);
                }
            }
        }

        [Fact]
        public void Deck_Standard52Cards_DealsCorrectly()
        {
            var deck = new Deck();
            Assert.Equal(52, deck.RemainingCount);

            deck.Shuffle();
            var hand = deck.DealCards(13);
            Assert.Equal(13, hand.Count);
            Assert.Equal(39, deck.RemainingCount);
            Assert.Equal(13, hand.Distinct().Count()); // Unique cards
        }

        [Fact]
        public void PokerEvaluator_DetectsRoyalFlush_From7Cards()
        {
            // 7 cards containing Heart: 10, J, Q, K, A (Royal Flush) plus 2 random cards
            var cards = new List<Card>
            {
                new Card(10, 3), // 10 Heart
                new Card(11, 3), // J Heart
                new Card(12, 3), // Q Heart
                new Card(13, 3), // K Heart
                new Card(1, 3),  // A Heart
                new Card(2, 0),  // 2 Spade
                new Card(5, 1)   // 5 Club
            };

            var rank = PokerEvaluator.Evaluate(cards);
            Assert.Equal(PokerHandRank.RoyalFlush, rank);
        }

        [Fact]
        public void PokerEvaluator_DetectsStraight_WithAceWheel()
        {
            // A, 2, 3, 4, 5 of different suits (Wheel Straight)
            var cards = new List<Card>
            {
                new Card(1, 0),  // A Spade
                new Card(2, 1),  // 2 Club
                new Card(3, 2),  // 3 Diamond
                new Card(4, 3),  // 4 Heart
                new Card(5, 0),  // 5 Spade
                new Card(9, 1),  // 9 Club
                new Card(13, 2)  // K Diamond
            };

            var rank = PokerEvaluator.Evaluate(cards);
            Assert.Equal(PokerHandRank.Straight, rank);
        }

        [Fact]
        public void PokerEvaluator_DetectsFullHouse_From7Cards()
        {
            // Three 9s and Two 4s
            var cards = new List<Card>
            {
                new Card(9, 0),
                new Card(9, 1),
                new Card(9, 2),
                new Card(4, 0),
                new Card(4, 1),
                new Card(2, 2),
                new Card(7, 3)
            };

            var rank = PokerEvaluator.Evaluate(cards);
            Assert.Equal(PokerHandRank.FullHouse, rank);
        }

        [Fact]
        public void PotSplitter_SplitsMainAndSidePots_Correctly()
        {
            // Player A: 100
            // Player B: 300
            // Player C: 500
            var bets = new List<PlayerBet>
            {
                new PlayerBet("PlayerA", 100),
                new PlayerBet("PlayerB", 300),
                new PlayerBet("PlayerC", 500)
            };

            var pots = PotSplitter.SplitPots(bets);

            // Expecting:
            // Main Pot: 100 * 3 = 300 (Eligible: A, B, C)
            // Side Pot 1: (300-100) * 2 = 400 (Eligible: B, C)
            // Side Pot 2: (500-300) * 1 = 200 (Eligible: C)
            Assert.Equal(3, pots.Count);

            Assert.Equal(300, pots[0].Amount);
            Assert.Equal(new[] { "PlayerA", "PlayerB", "PlayerC" }, pots[0].EligiblePlayers);

            Assert.Equal(400, pots[1].Amount);
            Assert.Equal(new[] { "PlayerB", "PlayerC" }, pots[1].EligiblePlayers);

            Assert.Equal(200, pots[2].Amount);
            Assert.Equal(new[] { "PlayerC" }, pots[2].EligiblePlayers);
        }

        [Fact]
        public void PotSplitter_HandlesFoldedPlayer_ExcludedFromEligibility()
        {
            // Player A: 100
            // Player B: 300
            // Player C: 500
            // Player D: 500 (Folded)
            var bets = new List<PlayerBet>
            {
                new PlayerBet("PlayerA", 100),
                new PlayerBet("PlayerB", 300),
                new PlayerBet("PlayerC", 500),
                new PlayerBet("PlayerD", 500, isFolded: true)
            };

            var pots = PotSplitter.SplitPots(bets);

            // Total chips = 100 + 300 + 500 + 500 = 1400
            // Main Pot: 100 * 4 = 400 (Eligible: A, B, C; D is folded so excluded)
            // Side Pot 1: 200 * 3 = 600 (Eligible: B, C; D is excluded)
            // Side Pot 2: 200 * 2 = 400 (Eligible: C only; D is excluded)
            int totalChips = pots.Sum(p => p.Amount);
            Assert.Equal(1400, totalChips);

            Assert.DoesNotContain("PlayerD", pots[0].EligiblePlayers);
            Assert.DoesNotContain("PlayerD", pots[1].EligiblePlayers);
            Assert.DoesNotContain("PlayerD", pots[2].EligiblePlayers);
            Assert.Contains("PlayerC", pots[2].EligiblePlayers);
        }

        [Fact]
        public void TaLaRule_SelectsConfigurationWithLowerTrashScore_WhenTwoConfigurationsPossible()
        {
            // Card 7 Diamond can either join {7 Spade, 7 Club, 7 Diamond} or {7 Diamond, 8 Diamond, 9 Diamond}
            // Hand:
            // 7 Spade (7), 7 Club (7), 7 Diamond (7)
            // 8 Diamond (8), 9 Diamond (9)
            // Plus trash cards: K Heart (13), 2 Spade (2), 3 Club (3), 4 Heart (4)
            //
            // Case 1 (choose Sáp 7-7-7):
            // Phom: {7 Spade, 7 Club, 7 Diamond}
            // Trash: 8 Diamond (8) + 9 Diamond (9) + K(13) + 2(2) + 3(3) + 4(4) = 39 points
            //
            // Case 2 (choose Sảnh 7-8-9 Diamond):
            // Phom: {7 Diamond, 8 Diamond, 9 Diamond}
            // Trash: 7 Spade (7) + 7 Club (7) + K(13) + 2(2) + 3(3) + 4(4) = 36 points
            //
            // Lower trash score is 36 points (Case 2). TaLaRule must pick Case 2!

            var hand = new List<Card>
            {
                new Card(7, 0),  // 7 Spade
                new Card(7, 1),  // 7 Club
                new Card(7, 2),  // 7 Diamond
                new Card(8, 2),  // 8 Diamond
                new Card(9, 2),  // 9 Diamond
                new Card(13, 3), // K Heart
                new Card(2, 0),  // 2 Spade
                new Card(3, 1),  // 3 Club
                new Card(4, 3)   // 4 Heart
            };

            var result = TaLaRule.FindBestPhomCombination(hand);

            Assert.Equal(36, result.MinTrashScore);
            Assert.Single(result.BestPhoms);

            // Ensure the chosen phom is the 7-8-9 diamond run
            var chosenPhom = result.BestPhoms[0];
            Assert.Contains(chosenPhom, c => c.Rank == 8 && c.Suit == 2);
            Assert.Contains(chosenPhom, c => c.Rank == 9 && c.Suit == 2);
        }
    }
}
