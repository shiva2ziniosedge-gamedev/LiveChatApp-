using Microsoft.AspNetCore.SignalR;

namespace LiveChatApp.Hubs
{
    public class ChatHub : Hub
    {
        // Static dictionary to store connected users
        private static Dictionary<string, string> ConnectedUsers = new Dictionary<string, string>();

        public override async Task OnConnectedAsync()
        {
            await base.OnConnectedAsync();
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            // Find and remove user by connection ID
            var user = ConnectedUsers.FirstOrDefault(x => x.Key == Context.ConnectionId);
            if (!string.IsNullOrEmpty(user.Value))
            {
                ConnectedUsers.Remove(Context.ConnectionId);
                await Clients.All.SendAsync("UserLeft", user.Value, ConnectedUsers.Values.ToList());
            }
            await base.OnDisconnectedAsync(exception);
        }

        public async Task JoinChat(string username)
        {
            // Add user to connected users
            ConnectedUsers[Context.ConnectionId] = username;
            
            // Notify all clients about new user and send updated user list
            await Clients.All.SendAsync("UserJoined", username, ConnectedUsers.Values.ToList());
        }

        public async Task SendMessage(string user, string message)
        {
            var timestamp = DateTime.Now.ToString("HH:mm");
            await Clients.All.SendAsync("ReceiveMessage", user, message, timestamp);
        }

        public async Task UserTyping(string user)
        {
            await Clients.Others.SendAsync("UserIsTyping", user);
        }

        public async Task UserStoppedTyping(string user)
        {
            await Clients.Others.SendAsync("UserStoppedTyping", user);
        }

        public async Task SendImage(string user, string imageData, string fileName)
        {
            var timestamp = DateTime.Now.ToString("HH:mm");
            await Clients.All.SendAsync("ReceiveImage", user, imageData, fileName, timestamp);
        }
    }
}
