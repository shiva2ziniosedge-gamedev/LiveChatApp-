using LiveChatApp.Hubs;

var builder = WebApplication.CreateBuilder(args);

// Add SignalR
builder.Services.AddSignalR();

var app = builder.Build();

// Serve static files (HTML, JS, CSS)
app.UseDefaultFiles();
app.UseStaticFiles();

// Map the ChatHub to /chatHub endpoint
app.MapHub<ChatHub>("/chatHub");

app.Run();
