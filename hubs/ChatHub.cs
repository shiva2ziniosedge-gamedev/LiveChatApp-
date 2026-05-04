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




        // ─────────────────────────────────────────────────────────────
        // VOICE CALL FEATURES - SignalR signaling methods for WebRTC
        // ─────────────────────────────────────────────────────────────

        // Called when a user initiates a voice call to another user
        public async Task CallUser(string caller, string target)
        {
            var targetConnection = ConnectedUsers.FirstOrDefault(x => x.Value == target);
            if (!string.IsNullOrEmpty(targetConnection.Key))
                await Clients.Client(targetConnection.Key).SendAsync("IncomingCall", caller);
        }

        // Called when the target user accepts the incoming call
        public async Task AcceptCall(string caller)
        {
            var callerConnection = ConnectedUsers.FirstOrDefault(x => x.Value == caller);
            if (!string.IsNullOrEmpty(callerConnection.Key))
                await Clients.Client(callerConnection.Key).SendAsync("CallAccepted", ConnectedUsers[Context.ConnectionId]);
        }

        // Called when the target user rejects the incoming call
        public async Task RejectCall(string caller)
        {
            var callerConnection = ConnectedUsers.FirstOrDefault(x => x.Value == caller);
            if (!string.IsNullOrEmpty(callerConnection.Key))
                await Clients.Client(callerConnection.Key).SendAsync("CallRejected");
        }

        // Called when either user ends the active call
        public async Task EndCall(string target)
        {
            var targetConnection = ConnectedUsers.FirstOrDefault(x => x.Value == target);
            if (!string.IsNullOrEmpty(targetConnection.Key))
                await Clients.Client(targetConnection.Key).SendAsync("CallEnded");
        }

        // WebRTC signaling - exchange SDP offer between peers
        public async Task SendOffer(string target, string offer)
        {
            var targetConnection = ConnectedUsers.FirstOrDefault(x => x.Value == target);
            if (!string.IsNullOrEmpty(targetConnection.Key))
                await Clients.Client(targetConnection.Key).SendAsync("ReceiveOffer", offer);
        }

        // WebRTC signaling - exchange SDP answer between peers
        public async Task SendAnswer(string target, string answer)
        {
            var targetConnection = ConnectedUsers.FirstOrDefault(x => x.Value == target);
            if (!string.IsNullOrEmpty(targetConnection.Key))
                await Clients.Client(targetConnection.Key).SendAsync("ReceiveAnswer", answer);
        }

        // WebRTC signaling - exchange ICE candidates between peers
        public async Task SendIceCandidate(string target, string candidate)
        {
            var targetConnection = ConnectedUsers.FirstOrDefault(x => x.Value == target);
            if (!string.IsNullOrEmpty(targetConnection.Key))
                await Clients.Client(targetConnection.Key).SendAsync("ReceiveIceCandidate", candidate);
        }
    }
}
