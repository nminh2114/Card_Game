using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using StackExchange.Redis;
using CardGame.Server.Data;
using CardGame.Server.Services;

var builder = WebApplication.CreateBuilder(args);

// Port binding for Cloud (Render/Railway/Fly.io)
var portEnv = Environment.GetEnvironmentVariable("PORT");
if (!string.IsNullOrEmpty(portEnv))
{
    builder.WebHost.UseUrls($"http://0.0.0.0:{portEnv}");
}

// 1. Database (PostgreSQL) - Supports both local connection strings and Cloud URL (DATABASE_URL from Render/Railway)
var rawConn = Environment.GetEnvironmentVariable("DATABASE_URL")
    ?? builder.Configuration.GetConnectionString("DefaultConnection") 
    ?? "Host=localhost;Port=5432;Database=card_game_db;Username=game_admin;Password=SecretPassword123!";

var connectionString = rawConn;
if (rawConn.StartsWith("postgres://") || rawConn.StartsWith("postgresql://"))
{
    try
    {
        var uri = new Uri(rawConn);
        var userInfo = uri.UserInfo.Split(':');
        var user = userInfo.Length > 0 ? userInfo[0] : "";
        var pass = userInfo.Length > 1 ? userInfo[1] : "";
        var port = uri.Port > 0 ? uri.Port : 5432;
        var db = uri.AbsolutePath.TrimStart('/');
        connectionString = $"Host={uri.Host};Port={port};Database={db};Username={user};Password={pass};SSL Mode=Require;Trust Server Certificate=true;";
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[Database Warning] Error parsing DATABASE_URL: {ex.Message}");
    }
}

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(connectionString));

// 2. Redis Cache
var redisConfig = builder.Configuration["Redis:ConnectionString"] 
    ?? "localhost:6379,password=RedisSecret123!,abortConnect=false";
try
{
    var multiplexer = ConnectionMultiplexer.Connect(redisConfig);
    builder.Services.AddSingleton<IConnectionMultiplexer>(multiplexer);
}
catch (Exception ex)
{
    Console.WriteLine($"[Warning] Could not connect to Redis: {ex.Message}. Running with fallback.");
    builder.Services.AddSingleton<IConnectionMultiplexer>(_ => null!);
}

// 3. Application Services
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<WalletService>();
builder.Services.AddSingleton<RoomService>();

// 4. Authentication (JWT)
var jwtKey = builder.Configuration["Jwt:Key"] ?? "SuperSecretKeyForJwtCardGame2026VeryLongStringMin32Chars!";
var keyBytes = Encoding.UTF8.GetBytes(jwtKey);

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.RequireHttpsMetadata = false;
    options.SaveToken = true;
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(keyBytes),
        ValidateIssuer = false,
        ValidateAudience = false,
        ClockSkew = TimeSpan.Zero
    };
});

builder.Services.AddAuthorization();
builder.Services.AddControllers();

// 5. CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", p => p.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader());
});

// 6. Swagger with JWT Support
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "Card Game API", Version = "v1" });
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Description = "Nhập JWT Token theo định dạng: Bearer {token}",
        Name = "Authorization",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.ApiKey,
        Scheme = "Bearer"
    });
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });
});

var app = builder.Build();

// Ensure database tables exist and seed default Super Admin if not present
using (var scope = app.Services.CreateScope())
{
    try
    {
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.Database.EnsureCreated();
        Console.WriteLine("[Database] Database schema ensured successfully.");

        // Auto-migration: Ensure all required columns and tables exist (for cloud databases on Render/Neon/Supabase)
        try
        {
            db.Database.ExecuteSqlRaw(@"
                ALTER TABLE ""Users"" ADD COLUMN IF NOT EXISTS ""Role"" text NOT NULL DEFAULT 'user';
                ALTER TABLE ""Users"" ADD COLUMN IF NOT EXISTS ""Avatar"" text NOT NULL DEFAULT '👤';
                ALTER TABLE ""Users"" ADD COLUMN IF NOT EXISTS ""Nickname"" text;
                ALTER TABLE ""Users"" ADD COLUMN IF NOT EXISTS ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT NOW();
                ALTER TABLE ""Users"" ADD COLUMN IF NOT EXISTS ""IsBanned"" boolean NOT NULL DEFAULT false;
                ALTER TABLE ""Users"" ADD COLUMN IF NOT EXISTS ""BannedUntil"" timestamp with time zone;
                ALTER TABLE ""Users"" ADD COLUMN IF NOT EXISTS ""BanReason"" text;

                CREATE TABLE IF NOT EXISTS ""DepositRequests"" (
                    ""Id"" text PRIMARY KEY,
                    ""UserId"" text NOT NULL,
                    ""Username"" text NOT NULL,
                    ""Amount"" integer NOT NULL,
                    ""TransferCode"" text NOT NULL,
                    ""Status"" text NOT NULL DEFAULT 'Pending',
                    ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT NOW(),
                    ""ProcessedAt"" timestamp with time zone,
                    ""ProcessedBy"" text,
                    ""RejectReason"" text
                );

                CREATE TABLE IF NOT EXISTS ""AuditLogs"" (
                    ""Id"" text PRIMARY KEY,
                    ""AdminUsername"" text NOT NULL DEFAULT 'admin',
                    ""ActionType"" text NOT NULL,
                    ""TargetUser"" text NOT NULL,
                    ""Details"" text NOT NULL DEFAULT '',
                    ""CreatedAt"" timestamp with time zone NOT NULL DEFAULT NOW()
                );
            ");
            Console.WriteLine("[Database] Auto-migration: Users columns & tables verified successfully.");
        }
        catch (Exception migEx)
        {
            Console.WriteLine($"[Database Auto-Migration Warning] {migEx.Message}");
        }

        var authService = scope.ServiceProvider.GetRequiredService<AuthService>();
        var walletService = scope.ServiceProvider.GetRequiredService<WalletService>();
        var admin = db.Users.Include(u => u.Wallet).FirstOrDefault(u => u.Username == "admin");
        if (admin == null)
        {
            var newAdmin = authService.RegisterAsync("admin", "Admin123!").GetAwaiter().GetResult();
            if (newAdmin != null)
            {
                newAdmin.Role = "admin";
                db.SaveChanges();
                walletService.UpdateBalanceAsync(newAdmin.Id, 9990000).GetAwaiter().GetResult();
                Console.WriteLine("[Database] Super Admin 'admin' initialized with 9,990,000 chips.");
            }
        }

        // Clean all old tables and non-admin player accounts as requested
        try
        {
            db.Database.ExecuteSqlRaw(@"
                DELETE FROM ""MatchHistory"";
                DELETE FROM ""DepositRequests"" WHERE ""UserId"" NOT IN (SELECT ""Id"" FROM ""Users"" WHERE LOWER(""Username"") = 'admin');
                DELETE FROM ""Wallets"" WHERE ""UserId"" NOT IN (SELECT ""Id"" FROM ""Users"" WHERE LOWER(""Username"") = 'admin');
                DELETE FROM ""Users"" WHERE LOWER(""Username"") != 'admin';
                UPDATE ""Wallets"" SET ""Balance"" = 10000000 WHERE ""UserId"" IN (SELECT ""Id"" FROM ""Users"" WHERE LOWER(""Username"") = 'admin');
            ");
            Console.WriteLine("[Database] Player database and match history cleaned successfully. Only Super Admin remains with 10M chips.");
        }
        catch (Exception cleanEx)
        {
            Console.WriteLine($"[Database Cleanup Warning] {cleanEx.Message}");
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[Database Notice] {ex.Message}");
    }
}

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment() || true)
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "Card Game API v1");
        c.RoutePrefix = "swagger";
    });
}

app.UseDefaultFiles();
app.UseStaticFiles();

app.UseCors("AllowAll");

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

// Health check API
app.MapGet("/api/health", () => Results.Ok(new { Status = "Online", Service = "CardGame Server", Version = "1.0.0" }));

app.Run();
