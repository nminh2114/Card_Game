using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using StackExchange.Redis;
using CardGame.Server.Core.Models;

namespace CardGame.Server.Services
{
    public class RoomService
    {
        private readonly IConnectionMultiplexer? _redis;
        private readonly IDatabase? _redisDb;
        private readonly Random _random = new();

        // In-memory active game tables
        private static readonly ConcurrentDictionary<string, GameTable> _tables = new();

        public RoomService(IConnectionMultiplexer? redis = null)
        {
            _redis = redis;
            if (_redis != null && _redis.IsConnected)
            {
                _redisDb = _redis.GetDatabase();
            }
        }

        public async Task<(string RoomCode, string TableId)> CreatePrivateRoomAsync(
            string hostUserId,
            string hostUsername,
            string hostNickname,
            string hostAvatar,
            int hostChips,
            string gameType = "tala",
            int stake = 2000,
            int minBuyIn = 20000,
            int maxPlayers = 4)
        {
            string tableId = Guid.NewGuid().ToString();
            string code;
            bool codeExists;

            // Generate unique 6-digit room code
            do
            {
                code = _random.Next(100000, 999999).ToString();
                if (_redisDb != null)
                {
                    codeExists = await _redisDb.KeyExistsAsync($"room_code:{code}");
                }
                else
                {
                    codeExists = _tables.Values.Any(t => t.RoomCode == code);
                }
            } while (codeExists);

            // Create in-memory table with full game attributes
            var table = new GameTable(tableId, code, gameType, stake, minBuyIn, maxPlayers);
            table.StatusMessage = $"Chờ người chơi vào bàn... (Mã: {code})";
            table.Players.Add(new TablePlayer
            {
                UserId = hostUserId,
                Username = hostUsername,
                Nickname = string.IsNullOrWhiteSpace(hostNickname) ? hostUsername : hostNickname,
                Avatar = string.IsNullOrWhiteSpace(hostAvatar) ? "👤" : hostAvatar,
                Chips = hostChips,
                SeatIndex = 0,
                IsHost = true
            });

            _tables[tableId] = table;

            // Store mapping code -> tableId in Redis with 15-minute TTL
            if (_redisDb != null)
            {
                await _redisDb.StringSetAsync($"room_code:{code}", tableId, TimeSpan.FromMinutes(15));
            }

            return (code, tableId);
        }

        public async Task<(bool Success, string TableId, string Message, GameTable? Table)> JoinRoomByCodeAsync(
            string code,
            string userId,
            string username,
            string nickname,
            string avatar,
            int userChips)
        {
            string? tableId = null;

            if (_redisDb != null)
            {
                var redisValue = await _redisDb.StringGetAsync($"room_code:{code}");
                if (!redisValue.IsNullOrEmpty)
                {
                    tableId = redisValue.ToString();
                }
            }

            // Fallback to in-memory lookup
            if (string.IsNullOrEmpty(tableId))
            {
                var found = _tables.Values.FirstOrDefault(t => t.RoomCode == code);
                tableId = found?.TableId;
            }

            if (string.IsNullOrEmpty(tableId) || !_tables.TryGetValue(tableId, out var table))
            {
                return (false, string.Empty, "Phòng không tồn tại hoặc mã phòng đã hết hạn.", null);
            }

            lock (table.TableLock)
            {
                // Check if user already in table (reconnect)
                var existing = table.Players.FirstOrDefault(p => p.UserId == userId);
                if (existing != null)
                {
                    existing.Nickname = string.IsNullOrWhiteSpace(nickname) ? existing.Nickname : nickname;
                    existing.Avatar = string.IsNullOrWhiteSpace(avatar) ? existing.Avatar : avatar;
                    existing.Chips = userChips;
                    return (true, tableId, "Kết nối lại bàn chơi thành công.", table);
                }

                if (userChips < table.MinBuyIn)
                {
                    return (false, tableId, $"Số dư không đủ. Bàn chơi yêu cầu tối thiểu {table.MinBuyIn:N0} chip.", null);
                }

                if (table.Players.Count >= table.MaxPlayers)
                {
                    return (false, tableId, "Bàn chơi đã đầy người (tối đa 4 người).", null);
                }

                // Find next free seat index
                var occupiedSeats = table.Players.Select(p => p.SeatIndex).ToHashSet();
                int nextSeat = 0;
                while (occupiedSeats.Contains(nextSeat)) nextSeat++;

                var newPlayer = new TablePlayer
                {
                    UserId = userId,
                    Username = username,
                    Nickname = string.IsNullOrWhiteSpace(nickname) ? username : nickname,
                    Avatar = string.IsNullOrWhiteSpace(avatar) ? "👤" : avatar,
                    Chips = userChips,
                    SeatIndex = nextSeat,
                    IsHost = false
                };

                table.Players.Add(newPlayer);
                table.StatusMessage = $"{newPlayer.Nickname} đã vào bàn! Hiện có {table.Players.Count} người chơi.";

                return (true, tableId, "Tham gia bàn chơi thành công.", table);
            }
        }

        // Deal cards for a new round: resets previous cards and deals fresh cards from server deck
        public (bool Success, string Message) DealNewRound(string tableId, string requesterUserId)
        {
            if (!_tables.TryGetValue(tableId, out var table))
            {
                return (false, "Bàn chơi không tồn tại.");
            }

            lock (table.TableLock)
            {
                if (table.Players.Count < 2)
                {
                    return (false, "Cần tối thiểu 2 người chơi trong bàn để bắt đầu ván đấu!");
                }

                var player = table.Players.FirstOrDefault(p => p.UserId == requesterUserId);
                if (player == null)
                {
                    return (false, "Bạn không có trong bàn chơi này.");
                }

                // Only host or first seated player can trigger deal
                if (!player.IsHost && table.Players[0].UserId != requesterUserId)
                {
                    return (false, "Chỉ chủ bàn mới có quyền bắt đầu chia bài!");
                }

                // 1. Reset all round data
                table.DiscardPile.Clear();
                table.CommunityCards.Clear();
                table.State = TableState.Dealing;
                table.PokerPhase = "preflop";

                // Shuffle fresh 52-card deck
                table.Deck = new Deck();
                table.Deck.Shuffle();

                // Rotate dealer seat for Poker
                table.DealerSeat = (table.DealerSeat + 1) % table.Players.Count;

                // 2. Deal cards sequentially per game type rules
                int cardsPerPlayer = table.GameType switch
                {
                    "poker" => 2,
                    "tala" => 9,
                    "tienlen" => 13,
                    "sam" => 10,
                    _ => 9
                };

                // Clear previous hands
                foreach (var p in table.Players)
                {
                    p.Hand.Clear();
                    p.LastPlayedCards.Clear();
                    p.HasFolded = false;
                    p.CurrentBet = 0;
                }

                // Deal cards to each player
                for (int c = 0; c < cardsPerPlayer; c++)
                {
                    foreach (var p in table.Players)
                    {
                        var card = table.Deck.DealCard();
                        p.Hand.Add(CardDto.FromCard(card));
                    }
                }

                // In Tá Lả, first player (Host/Dealer) gets the 10th card to discard first
                if (table.GameType == "tala")
                {
                    var firstPlayer = table.Players[0];
                    var extraCard = table.Deck.DealCard();
                    firstPlayer.Hand.Add(CardDto.FromCard(extraCard));
                    table.CurrentTurnUserId = firstPlayer.UserId;
                    table.StatusMessage = $"Ván mới bắt đầu! Lượt đầu tiên: {firstPlayer.Nickname} (có 10 lá).";
                }
                else if (table.GameType == "poker")
                {
                    // Small blind and big blind
                    int sb = table.Stake / 2;
                    int bb = table.Stake;
                    table.Pot = sb + bb;
                    table.CurrentTurnUserId = table.Players[(table.DealerSeat + 1) % table.Players.Count].UserId;
                    table.StatusMessage = $"Dealer chia bài tẩy cho mỗi người. Lượt cược Pre-flop!";
                }
                else
                {
                    table.Pot = table.Stake * table.Players.Count;
                    table.CurrentTurnUserId = table.Players[0].UserId;
                    table.StatusMessage = $"Đã chia xong bài ({cardsPerPlayer} lá/người). Đến lượt: {table.Players[0].Nickname}.";
                }

                table.DeckRemaining = table.Deck.RemainingCount;
                table.State = TableState.TurnLoop;

                return (true, "Đã chia bài thành công cho tất cả người chơi!");
            }
        }

        // Play card(s) from hand to table (supports single cards or pairs/combos with spread display)
        public (bool Success, string Message) PlayCards(string tableId, string userId, List<int> cardRawValues)
        {
            if (!_tables.TryGetValue(tableId, out var table))
                return (false, "Bàn chơi không tồn tại.");

            lock (table.TableLock)
            {
                if (table.State != TableState.TurnLoop)
                    return (false, "Bàn chơi chưa trong lượt đánh bài.");

                if (table.CurrentTurnUserId != userId)
                    return (false, "Chưa đến lượt của bạn!");

                var player = table.Players.FirstOrDefault(p => p.UserId == userId);
                if (player == null)
                    return (false, "Không tìm thấy người chơi trong bàn.");

                if (cardRawValues == null || cardRawValues.Count == 0)
                    return (false, "Vui lòng chọn ít nhất 1 lá bài để đánh.");

                // Verify cards exist in player hand
                var playedDtos = new List<CardDto>();
                foreach (var raw in cardRawValues)
                {
                    var found = player.Hand.FirstOrDefault(c => c.RawValue == raw);
                    if (found == null)
                    {
                        return (false, "Lá bài bạn chọn không có trên tay!");
                    }
                    playedDtos.Add(found);
                }

                // Remove from hand
                foreach (var dto in playedDtos)
                {
                    player.Hand.Remove(dto);
                    table.DiscardPile.Insert(0, dto);
                }

                player.LastPlayedCards = playedDtos;

                // Check win condition (e.g. out of cards in Tien Len / Sam)
                if (player.Hand.Count == 0 && (table.GameType == "tienlen" || table.GameType == "sam"))
                {
                    table.State = TableState.Settlement;
                    table.StatusMessage = $"🎉 CHÚC MỪNG {player.Nickname} ĐÃ ĐÁNH HẾT BÀI VÀ THẮNG CUỘC!";
                    return (true, $"Bạn đã đánh hết bài và giành chiến thắng!");
                }

                // Pass turn to next player in clockwise order
                int myIdx = table.Players.FindIndex(p => p.UserId == userId);
                int nextIdx = (myIdx + 1) % table.Players.Count;
                table.CurrentTurnUserId = table.Players[nextIdx].UserId;
                table.StatusMessage = $"{player.Nickname} vừa đánh {playedDtos.Count} lá. Đến lượt: {table.Players[nextIdx].Nickname}.";

                return (true, "Đánh bài thành công.");
            }
        }

        // Draw card (for Tá Lả bốc bài)
        public (bool Success, string Message, CardDto? Card) DrawCard(string tableId, string userId)
        {
            if (!_tables.TryGetValue(tableId, out var table))
                return (false, "Bàn chơi không tồn tại.", null);

            lock (table.TableLock)
            {
                if (table.CurrentTurnUserId != userId)
                    return (false, "Chưa đến lượt của bạn để bốc bài!", null);

                var player = table.Players.FirstOrDefault(p => p.UserId == userId);
                if (player == null)
                    return (false, "Không tìm thấy người chơi.", null);

                if (table.Deck == null || table.Deck.RemainingCount == 0)
                    return (false, "Nọc bài trong bàn đã hết!", null);

                var card = table.Deck.DealCard();
                var cardDto = CardDto.FromCard(card);
                player.Hand.Add(cardDto);
                table.DeckRemaining = table.Deck.RemainingCount;
                table.StatusMessage = $"{player.Nickname} vừa bốc 1 lá từ nọc bài. Hãy chọn 1 lá để đánh.";

                return (true, "Đã bốc bài thành công.", cardDto);
            }
        }

        // Take card (Tá Lả ăn bài từ cửa trên)
        public (bool Success, string Message) TakeCard(string tableId, string userId)
        {
            if (!_tables.TryGetValue(tableId, out var table))
                return (false, "Bàn chơi không tồn tại.");

            lock (table.TableLock)
            {
                if (table.CurrentTurnUserId != userId)
                    return (false, "Chưa đến lượt của bạn!");

                var player = table.Players.FirstOrDefault(p => p.UserId == userId);
                if (player == null)
                    return (false, "Không tìm thấy người chơi trong bàn.");

                if (table.DiscardPile.Count == 0)
                    return (false, "Chưa có lá bài nào được đánh để ăn!");

                var takenCard = table.DiscardPile[0];
                table.DiscardPile.RemoveAt(0);
                player.Hand.Add(takenCard);
                table.StatusMessage = $"{player.Nickname} vừa ăn lá {takenCard.DisplayName}! Hãy chọn 1 lá rác để đánh.";

                return (true, $"Đã ăn lá {takenCard.DisplayName} thành công.");
            }
        }

        // Pass turn (Bỏ lượt trong Tiến Lên / Sâm Lốc)
        public (bool Success, string Message) PassTurn(string tableId, string userId)
        {
            if (!_tables.TryGetValue(tableId, out var table))
                return (false, "Bàn chơi không tồn tại.");

            lock (table.TableLock)
            {
                if (table.CurrentTurnUserId != userId)
                    return (false, "Chưa đến lượt của bạn!");

                var player = table.Players.FirstOrDefault(p => p.UserId == userId);
                if (player == null)
                    return (false, "Không tìm thấy người chơi trong bàn.");

                int myIdx = table.Players.FindIndex(p => p.UserId == userId);
                int nextIdx = (myIdx + 1) % table.Players.Count;
                table.CurrentTurnUserId = table.Players[nextIdx].UserId;
                table.StatusMessage = $"{player.Nickname} đã bỏ lượt. Đến lượt: {table.Players[nextIdx].Nickname}.";

                return (true, "Đã bỏ lượt thành công.");
            }
        }

        // Poker betting action (Check, Call, Raise, Fold)
        public (bool Success, string Message) PokerAction(string tableId, string userId, string action, int amount = 0)
        {
            if (!_tables.TryGetValue(tableId, out var table))
                return (false, "Bàn chơi không tồn tại.");

            lock (table.TableLock)
            {
                var player = table.Players.FirstOrDefault(p => p.UserId == userId);
                if (player == null) return (false, "Không tìm thấy người chơi.");

                if (action.ToLower() == "fold")
                {
                    player.HasFolded = true;
                    table.StatusMessage = $"{player.Nickname} đã Bỏ Bài (Fold).";
                }
                else if (action.ToLower() == "call" || action.ToLower() == "check")
                {
                    table.StatusMessage = $"{player.Nickname} đã {action.ToUpper()}.";
                }
                else if (action.ToLower() == "raise")
                {
                    int raiseAmt = amount > 0 ? amount : table.Stake;
                    table.Pot += raiseAmt;
                    table.StatusMessage = $"{player.Nickname} Tố thêm {raiseAmt:N0} chip!";
                }

                // Check remaining active players in poker
                var activePlayers = table.Players.Where(p => !p.HasFolded).ToList();
                if (activePlayers.Count <= 1)
                {
                    var winner = activePlayers.FirstOrDefault() ?? player;
                    table.State = TableState.Settlement;
                    table.StatusMessage = $"🎉 {winner.Nickname} là người duy nhất chưa bỏ bài và thắng toàn bộ {table.Pot:N0} chip!";
                    return (true, $"{winner.Nickname} thắng ván bài!");
                }

                // Advance poker phase if needed
                if (table.PokerPhase == "preflop" && table.CommunityCards.Count == 0 && table.Deck != null)
                {
                    // Deal Flop (3 cards)
                    table.PokerPhase = "flop";
                    for (int i = 0; i < 3; i++)
                    {
                        var c = table.Deck.DealCard();
                        table.CommunityCards.Add(CardDto.FromCard(c));
                    }
                    table.StatusMessage = "Dealer mở 3 lá bài chung (Flop)!";
                }
                else if (table.PokerPhase == "flop" && table.CommunityCards.Count == 3 && table.Deck != null)
                {
                    // Deal Turn (1 card)
                    table.PokerPhase = "turn";
                    var c = table.Deck.DealCard();
                    table.CommunityCards.Add(CardDto.FromCard(c));
                    table.StatusMessage = "Dealer mở lá bài thứ 4 (Turn)!";
                }
                else if (table.PokerPhase == "turn" && table.CommunityCards.Count == 4 && table.Deck != null)
                {
                    // Deal River (1 card)
                    table.PokerPhase = "river";
                    var c = table.Deck.DealCard();
                    table.CommunityCards.Add(CardDto.FromCard(c));
                    table.StatusMessage = "Dealer mở lá bài cuối cùng (River)!";
                }

                // Next turn
                int curIdx = table.Players.FindIndex(p => p.UserId == userId);
                int nextIdx = (curIdx + 1) % table.Players.Count;
                while (table.Players[nextIdx].HasFolded && nextIdx != curIdx)
                {
                    nextIdx = (nextIdx + 1) % table.Players.Count;
                }
                table.CurrentTurnUserId = table.Players[nextIdx].UserId;

                return (true, "Thao tác Poker thành công.");
            }
        }

        // Returns synchronized table view, masking opponent hands for security
        public object? GetTableStateForUser(string tableId, string userId)
        {
            if (!_tables.TryGetValue(tableId, out var table)) return null;

            lock (table.TableLock)
            {
                var isHost = table.Players.Count > 0 && table.Players[0].UserId == userId;

                return new
                {
                    table.TableId,
                    table.RoomCode,
                    table.GameType,
                    table.Stake,
                    table.MinBuyIn,
                    table.MaxPlayers,
                    State = table.State.ToString(),
                    table.StatusMessage,
                    table.DealerSeat,
                    table.CurrentTurnUserId,
                    table.Pot,
                    table.DeckRemaining,
                    table.PokerPhase,
                    table.CommunityCards,
                    table.DiscardPile,
                    IsHost = isHost,
                    Players = table.Players.Select(p => new
                    {
                        p.UserId,
                        p.Username,
                        p.Nickname,
                        p.Avatar,
                        p.Chips,
                        p.SeatIndex,
                        p.IsHost,
                        p.IsReady,
                        p.HasFolded,
                        p.CurrentBet,
                        CardCount = p.Hand.Count,
                        p.LastPlayedCards,
                        // ONLY reveal cards to the owner of this hand!
                        Hand = (p.UserId == userId) ? p.Hand : new List<CardDto>()
                    })
                };
            }
        }

        public GameTable? GetTable(string tableId)
        {
            _tables.TryGetValue(tableId, out var table);
            return table;
        }

        public IEnumerable<GameTable> GetAllTables()
        {
            return _tables.Values;
        }

        public bool KickPlayerFromTable(string tableId, string userId)
        {
            if (!_tables.TryGetValue(tableId, out var table)) return false;

            lock (table.TableLock)
            {
                var player = table.Players.FirstOrDefault(p => p.UserId == userId);
                if (player == null) return false;

                table.Players.Remove(player);

                if (table.Players.Count == 0)
                {
                    _tables.TryRemove(tableId, out _);
                }

                return true;
            }
        }

        public bool CloseTable(string tableId)
        {
            return _tables.TryRemove(tableId, out _);
        }

        // Delete all in-memory tables and room codes
        public void ClearAllTables()
        {
            _tables.Clear();
        }
    }
}
