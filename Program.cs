using LiveChatApp.Hubs;

var builder = WebApplication.CreateBuilder(args);

// Add SignalR with increased message size for images
builder.Services.AddSignalR(options =>
{
    options.MaximumReceiveMessageSize = 10 * 1024 * 1024; // 10 MB for images
});

var app = builder.Build();

// Serve static files (HTML, JS, CSS)
app.UseDefaultFiles();
app.UseStaticFiles();

// Map the ChatHub to /chatHub endpoint
app.MapHub<ChatHub>("/chatHub");

app.Run();
