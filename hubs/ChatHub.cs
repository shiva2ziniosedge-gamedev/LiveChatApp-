using Microsoft.AspNetCore.SignalR;

namespace LiveChatApp.Hubs
{
    public class ChatHub : Hub
    {
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
    }
}
