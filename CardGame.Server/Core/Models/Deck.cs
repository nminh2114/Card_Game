using System;
using System.Collections.Generic;

namespace CardGame.Server.Core.Models
{
    public class Deck
    {
        private readonly List<Card> _cards = new(52);
        private readonly Random _random = new();

        public Deck()
        {
            Reset();
        }

        public int RemainingCount => _cards.Count;

        public void Reset()
        {
            _cards.Clear();
            for (byte suit = 0; suit < 4; suit++)
            {
                for (byte rank = 1; rank <= 13; rank++)
                {
                    _cards.Add(new Card(rank, suit));
                }
            }
        }

        public void Shuffle()
        {
            for (int i = _cards.Count - 1; i > 0; i--)
            {
                int k = _random.Next(i + 1);
                (_cards[i], _cards[k]) = (_cards[k], _cards[i]);
            }
        }

        public Card DealCard()
        {
            if (_cards.Count == 0) throw new InvalidOperationException("The deck is empty.");
            var card = _cards[^1];
            _cards.RemoveAt(_cards.Count - 1);
            return card;
        }

        public List<Card> DealCards(int count)
        {
            if (count > _cards.Count) throw new InvalidOperationException($"Cannot deal {count} cards. Only {_cards.Count} remaining.");
            var dealt = new List<Card>(count);
            for (int i = 0; i < count; i++)
            {
                dealt.Add(DealCard());
            }
            return dealt;
        }
    }
}
