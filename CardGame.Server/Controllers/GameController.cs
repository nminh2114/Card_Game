using System.Collections.Generic;
using System.Linq;
using Microsoft.AspNetCore.Mvc;
using CardGame.Server.Core.Models;
using CardGame.Server.Core.Rules;

namespace CardGame.Server.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class GameController : ControllerBase
    {
        public class DealRequest
        {
            public int CardCount { get; set; } = 13;
        }

        public class EvaluatePokerRequest
        {
            public List<int> Cards { get; set; } = new(); // 5 to 7 raw bytes or rank/suit
        }

        public class EvaluateTaLaRequest
        {
            public List<int> Cards { get; set; } = new(); // 9 to 10 raw bytes
        }

        [HttpPost("deal")]
        public IActionResult DealCards([FromBody] DealRequest req)
        {
            int count = req.CardCount <= 0 || req.CardCount > 52 ? 13 : req.CardCount;
            var deck = new Deck();
            deck.Shuffle();
            var dealt = deck.DealCards(count);

            return Ok(new
            {
                RemainingInDeck = deck.RemainingCount,
                Cards = dealt.Select(c => new
                {
                    c.RawValue,
                    c.Rank,
                    c.Suit,
                    DisplayName = c.ToString()
                })
            });
        }

        [HttpPost("evaluate-poker")]
        public IActionResult EvaluatePoker([FromBody] EvaluatePokerRequest req)
        {
            if (req.Cards == null || req.Cards.Count < 5)
            {
                return BadRequest(new { Message = "Cần ít nhất 5 lá bài để đánh giá Poker." });
            }

            var cards = req.Cards.Select(b => new Card((byte)b)).ToList();
            var rank = PokerEvaluator.Evaluate(cards);

            return Ok(new
            {
                HandRank = rank.ToString(),
                HandRankId = (int)rank,
                Cards = cards.Select(c => new { c.RawValue, c.Rank, c.Suit, DisplayName = c.ToString() })
            });
        }

        [HttpPost("evaluate-tala")]
        public IActionResult EvaluateTaLa([FromBody] EvaluateTaLaRequest req)
        {
            if (req.Cards == null || req.Cards.Count == 0)
            {
                return BadRequest(new { Message = "Danh sách bài không được để trống." });
            }

            var cards = req.Cards.Select(b => new Card((byte)b)).ToList();
            var result = TaLaRule.FindBestPhomCombination(cards);

            return Ok(new
            {
                PhomsCount = result.BestPhoms.Count,
                MinTrashScore = result.MinTrashScore,
                BestPhoms = result.BestPhoms.Select(p => p.Select(c => new
                {
                    c.RawValue,
                    c.Rank,
                    c.Suit,
                    DisplayName = c.ToString()
                })),
                TrashCards = result.TrashCards.Select(c => new
                {
                    c.RawValue,
                    c.Rank,
                    c.Suit,
                    DisplayName = c.ToString()
                })
            });
        }
    }
}
