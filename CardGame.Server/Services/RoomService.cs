using System;
using System.Collections.Concurrent;
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
            int hostChips,
            int maxPlayers = 4,
            int minBuyIn = 1000)
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

            // Create in-memory table
            var table = new GameTable(tableId, code, maxPlayers, minBuyIn);
            table.Players.Add(new TablePlayer
            {
                UserId = hostUserId,
                Username = hostUsername,
                Chips = hostChips,
                SeatIndex = 0
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

            // Fallback to in-memory lookup if Redis not connected or key found
            if (string.IsNullOrEmpty(tableId))
            {
                var found = _tables.Values.FirstOrDefault(t => t.RoomCode == code);
                tableId = found?.TableId;
            }

            if (string.IsNullOrEmpty(tableId) || !_tables.TryGetValue(tableId, out var table))
            {
                return (false, string.Empty, "Phòng không tồn tại hoặc mã mời đã hết hạn (15 phút).", null);
            }

            // Thread-safe lock on the table instance to avoid race condition when multiple players join the last seat
            lock (table.TableLock)
            {
                // Check if user already in table (reconnect)
                var existing = table.Players.FirstOrDefault(p => p.UserId == userId);
                if (existing != null)
                {
                    return (true, tableId, "Kết nối lại bàn chơi thành công.", table);
                }

                // Check balance condition
                if (userChips < table.MinBuyIn)
                {
                    return (false, tableId, $"Số dư không đủ. Yêu cầu tối thiểu {table.MinBuyIn} chip.", null);
                }

                // Check capacity condition
                if (table.Players.Count >= table.MaxPlayers)
                {
                    return (false, tableId, "Bàn chơi đã đầy người.", null);
                }

                // Find next free seat index
                var occupiedSeats = table.Players.Select(p => p.SeatIndex).ToHashSet();
                int nextSeat = 0;
                while (occupiedSeats.Contains(nextSeat)) nextSeat++;

                var newPlayer = new TablePlayer
                {
                    UserId = userId,
                    Username = username,
                    Chips = userChips,
                    SeatIndex = nextSeat
                };

                table.Players.Add(newPlayer);
                return (true, tableId, "Tham gia bàn chơi thành công.", table);
            }
        }

        public GameTable? GetTable(string tableId)
        {
            _tables.TryGetValue(tableId, out var table);
            return table;
        }

        public System.Collections.Generic.IEnumerable<GameTable> GetAllTables()
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

                // If table is now empty, remove table
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
    }
}
