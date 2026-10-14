-- Script khởi tạo CSDL cho Game Bài (card_game_db)
-- Được tự động chạy khi container Postgres khởi động lần đầu qua /docker-entrypoint-initdb.d

CREATE TABLE IF NOT EXISTS "Users" (
    "Id" VARCHAR(64) PRIMARY KEY,
    "Username" VARCHAR(50) NOT NULL UNIQUE,
    "PasswordHash" VARCHAR(255) NOT NULL,
    "Role" VARCHAR(20) NOT NULL DEFAULT 'user',
    "Avatar" VARCHAR(20) NOT NULL DEFAULT '👤',
    "Nickname" VARCHAR(100),
    "CreatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "IsBanned" BOOLEAN NOT NULL DEFAULT false,
    "BannedUntil" TIMESTAMP WITH TIME ZONE,
    "BanReason" TEXT
);

CREATE TABLE IF NOT EXISTS "Wallets" (
    "UserId" VARCHAR(64) PRIMARY KEY,
    "Balance" INT NOT NULL DEFAULT 0,
    "UpdatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FK_Wallets_Users" FOREIGN KEY ("UserId") REFERENCES "Users"("Id") ON DELETE CASCADE,
    CONSTRAINT "CHK_Wallet_Balance_NonNegative" CHECK ("Balance" >= 0)
);

CREATE TABLE IF NOT EXISTS "DepositRequests" (
    "Id" VARCHAR(64) PRIMARY KEY,
    "UserId" VARCHAR(64) NOT NULL,
    "Username" VARCHAR(50) NOT NULL,
    "Amount" INT NOT NULL,
    "TransferCode" VARCHAR(100) NOT NULL,
    "Status" VARCHAR(20) NOT NULL DEFAULT 'Pending',
    "CreatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "ProcessedAt" TIMESTAMP WITH TIME ZONE,
    "ProcessedBy" VARCHAR(50),
    "RejectReason" TEXT
);

CREATE TABLE IF NOT EXISTS "AuditLogs" (
    "Id" VARCHAR(64) PRIMARY KEY,
    "AdminUsername" VARCHAR(50) NOT NULL DEFAULT 'admin',
    "ActionType" VARCHAR(50) NOT NULL,
    "TargetUser" VARCHAR(50) NOT NULL,
    "Details" TEXT NOT NULL DEFAULT '',
    "CreatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "MatchHistory" (
    "Id" VARCHAR(64) PRIMARY KEY,
    "GameType" VARCHAR(50) NOT NULL,
    "RoomId" VARCHAR(64) NOT NULL,
    "WinnerId" VARCHAR(64) NOT NULL,
    "PotAmount" INT NOT NULL,
    "CreatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index tối ưu tìm kiếm
CREATE INDEX IF NOT EXISTS "IX_Users_Username" ON "Users"("Username");
CREATE INDEX IF NOT EXISTS "IX_MatchHistory_RoomId" ON "MatchHistory"("RoomId");
CREATE INDEX IF NOT EXISTS "IX_DepositRequests_Status" ON "DepositRequests"("Status");
