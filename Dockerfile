# Build stage
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Copy csproj and restore
COPY ["CardGame.Server/CardGame.Server.csproj", "CardGame.Server/"]
RUN dotnet restore "CardGame.Server/CardGame.Server.csproj"

# Copy entire source code and publish
COPY . .
WORKDIR "/src/CardGame.Server"
RUN dotnet publish "CardGame.Server.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

ENV ASPNETCORE_ENVIRONMENT=Production
ENV PORT=10000
EXPOSE 10000

ENTRYPOINT ["dotnet", "CardGame.Server.dll"]
