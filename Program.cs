using LiveChatApp.Hubs;

var builder = WebApplication.CreateBuilder(args);

// Add SignalR with increased message size for images
builder.Services.AddSignalR(options =>
{
    options.MaximumReceiveMessageSize = 10 * 1024 * 1024; // 10 MB for images
});

var app = builder.Build();

// Serve static files (HTML, JS, CSS)
// Set login.html as the default page
var defaultFilesOptions = new DefaultFilesOptions();
defaultFilesOptions.DefaultFileNames.Clear();
defaultFilesOptions.DefaultFileNames.Add("login.html");
app.UseDefaultFiles(defaultFilesOptions);
app.UseStaticFiles();

// Map the ChatHub to /chatHub endpoint
app.MapHub<ChatHub>("/chatHub");

app.Run();
