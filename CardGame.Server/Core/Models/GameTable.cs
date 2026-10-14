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

    public class TablePlayer
    {
        public string UserId { get; set; } = string.Empty;
        public string Username { get; set; } = string.Empty;
        public int Chips { get; set; }
        public int SeatIndex { get; set; }
        public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
    }

    public class GameTable
    {
        public string TableId { get; set; } = Guid.NewGuid().ToString();
        public string RoomCode { get; set; } = string.Empty;
        public int MaxPlayers { get; set; } = 4;
        public int MinBuyIn { get; set; } = 1000;
        public TableState State { get; set; } = TableState.Waiting;
        public List<TablePlayer> Players { get; set; } = new();
        public readonly object TableLock = new();

        public GameTable() { }

        public GameTable(string tableId, string roomCode, int maxPlayers = 4, int minBuyIn = 1000)
        {
            TableId = tableId;
            RoomCode = roomCode;
            MaxPlayers = maxPlayers;
            MinBuyIn = minBuyIn;
        }
    }
}
