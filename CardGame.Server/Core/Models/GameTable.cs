using System;
using System.Collections.Generic;

namespace CardGame.Server.Core.Models
{
    public enum TableState
    {
        Waiting,
        Dealing,
        TurnLoop,
        Settlement
    }

    public class CardDto
    {
        public int RawValue { get; set; }
        public string Rank { get; set; } = string.Empty;
        public string Suit { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;

        public static CardDto FromCard(Card c)
        {
            string[] ranks = { "", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K" };
            string[] suits = { "♠", "♣", "♦", "♥" };
            string r = (c.Rank >= 1 && c.Rank <= 13) ? ranks[c.Rank] : c.Rank.ToString();
            string s = (c.Suit <= 3) ? suits[c.Suit] : "";
            return new CardDto
            {
                RawValue = c.RawValue,
                Rank = r,
                Suit = s,
                DisplayName = c.ToString()
            };
        }
    }

    public class TablePlayer
    {
        public string UserId { get; set; } = string.Empty;
        public string Username { get; set; } = string.Empty;
        public string Nickname { get; set; } = string.Empty;
        public string Avatar { get; set; } = "👤";
        public int Chips { get; set; }
        public int SeatIndex { get; set; } // 0 = Host, 1 = Next, 2, 3
        public bool IsHost { get; set; } = false;
        public bool IsReady { get; set; } = true;
        public bool HasFolded { get; set; } = false;
        public int CurrentBet { get; set; } = 0;
        public List<CardDto> Hand { get; set; } = new();
        public List<CardDto> LastPlayedCards { get; set; } = new();
        public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
    }

    public class GameTable
    {
        public string TableId { get; set; } = Guid.NewGuid().ToString();
        public string RoomCode { get; set; } = string.Empty;
        public string GameType { get; set; } = "tala"; // tala, poker, tienlen, sam
        public int Stake { get; set; } = 2000;
        public int MinBuyIn { get; set; } = 20000;
        public int MaxPlayers { get; set; } = 4;
        public TableState State { get; set; } = TableState.Waiting;
        public string StatusMessage { get; set; } = "Đang chờ người chơi vào bàn...";
        public int DealerSeat { get; set; } = 0; // Dealer badge
        public string CurrentTurnUserId { get; set; } = string.Empty;
        public int Pot { get; set; } = 0;
        public int DeckRemaining { get; set; } = 52;
        public string PokerPhase { get; set; } = "preflop"; // preflop, flop, turn, river, showdown
        public List<CardDto> CommunityCards { get; set; } = new();
        public List<CardDto> DiscardPile { get; set; } = new();
        public List<TablePlayer> Players { get; set; } = new();
        public Deck? Deck { get; set; }
        public readonly object TableLock = new();
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public GameTable() { }

        public GameTable(string tableId, string roomCode, string gameType = "tala", int stake = 2000, int minBuyIn = 20000, int maxPlayers = 4)
        {
            TableId = tableId;
            RoomCode = roomCode;
            GameType = gameType;
            Stake = stake;
            MinBuyIn = minBuyIn;
            MaxPlayers = maxPlayers;
        }
    }
}
