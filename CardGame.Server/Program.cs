using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using StackExchange.Redis;
using CardGame.Server.Data;
using CardGame.Server.Services;

var builder = WebApplication.CreateBuilder(args);

// 1. Database (PostgreSQL)
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection") 
    ?? "Host=localhost;Port=5432;Database=card_game_db;Username=game_admin;Password=SecretPassword123!";
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
