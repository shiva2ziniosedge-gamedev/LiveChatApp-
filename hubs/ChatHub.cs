using Microsoft.AspNetCore.SignalR;

namespace LiveChatApp.Hubs
{
    public class ChatHub : Hub
    {
        private static Dictionary<string, string> ConnectedUsers = new Dictionary<string, string>();

        public override async Task OnConnectedAsync()
        {
            await base.OnConnectedAsync();
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
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
            ConnectedUsers[Context.ConnectionId] = username;
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

        public async Task CallUser(string caller, string target)
        {
            var targetConnection = ConnectedUsers.FirstOrDefault(x => x.Value == target);
            if (!string.IsNullOrEmpty(targetConnection.Key))
                await Clients.Client(targetConnection.Key).SendAsync("IncomingCall", caller);
        }

        public async Task AcceptCall(string caller)
        {
            var callerConnection = ConnectedUsers.FirstOrDefault(x => x.Value == caller);
            if (!string.IsNullOrEmpty(callerConnection.Key))
                await Clients.Client(callerConnection.Key).SendAsync("CallAccepted", ConnectedUsers[Context.ConnectionId]);
        }

        public async Task RejectCall(string caller)
        {
            var callerConnection = ConnectedUsers.FirstOrDefault(x => x.Value == caller);
            if (!string.IsNullOrEmpty(callerConnection.Key))
                await Clients.Client(callerConnection.Key).SendAsync("CallRejected");
        }

        public async Task EndCall(string target)
        {
            var targetConnection = ConnectedUsers.FirstOrDefault(x => x.Value == target);
            if (!string.IsNullOrEmpty(targetConnection.Key))
                await Clients.Client(targetConnection.Key).SendAsync("CallEnded");
        }

        public async Task SendOffer(string target, string offer)
        {
            var targetConnection = ConnectedUsers.FirstOrDefault(x => x.Value == target);
            if (!string.IsNullOrEmpty(targetConnection.Key))
                await Clients.Client(targetConnection.Key).SendAsync("ReceiveOffer", offer);
        }

        public async Task SendAnswer(string target, string answer)
        {
            var targetConnection = ConnectedUsers.FirstOrDefault(x => x.Value == target);
            if (!string.IsNullOrEmpty(targetConnection.Key))
                await Clients.Client(targetConnection.Key).SendAsync("ReceiveAnswer", answer);
        }

        public async Task SendIceCandidate(string target, string candidate)
        {
            var targetConnection = ConnectedUsers.FirstOrDefault(x => x.Value == target);
            if (!string.IsNullOrEmpty(targetConnection.Key))
                await Clients.Client(targetConnection.Key).SendAsync("ReceiveIceCandidate", candidate);
        }
    }
}
