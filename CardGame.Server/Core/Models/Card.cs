using System;

namespace CardGame.Server.Core.Models
{
    public readonly struct Card : IEquatable<Card>
    {
        private readonly byte _value;

        // 4 low bits (0-3): Rank (1 to 13)
        // 2 high bits (4-5): Suit (0 to 3: 0=Spade, 1=Club, 2=Diamond, 3=Heart)
        public Card(byte rank, byte suit)
        {
            if (rank < 1 || rank > 13) throw new ArgumentOutOfRangeException(nameof(rank), "Rank must be between 1 and 13.");
            if (suit > 3) throw new ArgumentOutOfRangeException(nameof(suit), "Suit must be between 0 and 3.");
            _value = (byte)((suit << 4) | (rank & 0x0F));
        }

        public Card(byte rawByte)
        {
            _value = rawByte;
        }

        public byte RawValue => _value;
        public byte Rank => (byte)(_value & 0x0F);
        public byte Suit => (byte)((_value >> 4) & 0x03);

        public bool Equals(Card other) => _value == other._value;
        public override bool Equals(object? obj) => obj is Card other && Equals(other);
        public override int GetHashCode() => _value.GetHashCode();

        public static bool operator ==(Card left, Card right) => left.Equals(right);
        public static bool operator !=(Card left, Card right) => !left.Equals(right);

        public override string ToString()
        {
            string[] ranks = { "", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K" };
            string[] suits = { "♠", "♣", "♦", "♥" };
            return (Rank >= 1 && Rank <= 13 && Suit <= 3) ? $"{ranks[Rank]}{suits[Suit]}" : $"Unknown({_value})";
        }
    }
}
