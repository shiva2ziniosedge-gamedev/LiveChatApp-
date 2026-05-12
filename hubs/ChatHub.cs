using Microsoft.AspNetCore.SignalR;

namespace LiveChatApp.Hubs
{
    public class ChatHub : Hub
    {
        // connectionId -> (username, projectId)
        private static Dictionary<string, (string Name, string Project)> ConnectedUsers
            = new Dictionary<string, (string, string)>();

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            if (ConnectedUsers.TryGetValue(Context.ConnectionId, out var user))
            {
                ConnectedUsers.Remove(Context.ConnectionId);
                await Groups.RemoveFromGroupAsync(Context.ConnectionId, user.Project);

                var projectUsers = ConnectedUsers
                    .Where(x => x.Value.Project == user.Project)
                    .Select(x => x.Value.Name)
                    .ToList();

                await Clients.Group(user.Project).SendAsync("UserLeft", user.Name, projectUsers);
            }
            await base.OnDisconnectedAsync(exception);
        }

        // Join a project room
        public async Task JoinChat(string username, string projectId)
        {
            ConnectedUsers[Context.ConnectionId] = (username, projectId);
            await Groups.AddToGroupAsync(Context.ConnectionId, projectId);

            var projectUsers = ConnectedUsers
                .Where(x => x.Value.Project == projectId)
                .Select(x => x.Value.Name)
                .ToList();

            await Clients.Group(projectId).SendAsync("UserJoined", username, projectUsers);
        }

        public async Task SendMessage(string user, string message)
        {
            if (!ConnectedUsers.TryGetValue(Context.ConnectionId, out var info)) return;
            var timestamp = DateTime.Now.ToString("HH:mm");
            await Clients.Group(info.Project).SendAsync("ReceiveMessage", user, message, timestamp);
        }

        public async Task UserTyping(string user)
        {
            if (!ConnectedUsers.TryGetValue(Context.ConnectionId, out var info)) return;
            await Clients.OthersInGroup(info.Project).SendAsync("UserIsTyping", user);
        }

        public async Task UserStoppedTyping(string user)
        {
            if (!ConnectedUsers.TryGetValue(Context.ConnectionId, out var info)) return;
            await Clients.OthersInGroup(info.Project).SendAsync("UserStoppedTyping", user);
        }

        public async Task SendImage(string user, string imageData, string fileName)
        {
            if (!ConnectedUsers.TryGetValue(Context.ConnectionId, out var info)) return;
            var timestamp = DateTime.Now.ToString("HH:mm");
            await Clients.Group(info.Project).SendAsync("ReceiveImage", user, imageData, fileName, timestamp);
        }

        // ── Voice Call (scoped to project members only) ──

        public async Task CallUser(string caller, string target)
        {
            var targetConn = ConnectedUsers.FirstOrDefault(x => x.Value.Name == target);
            if (!string.IsNullOrEmpty(targetConn.Key))
                await Clients.Client(targetConn.Key).SendAsync("IncomingCall", caller);
        }

        public async Task AcceptCall(string caller)
        {
            var callerConn = ConnectedUsers.FirstOrDefault(x => x.Value.Name == caller);
            if (!string.IsNullOrEmpty(callerConn.Key))
                await Clients.Client(callerConn.Key).SendAsync("CallAccepted", ConnectedUsers[Context.ConnectionId].Name);
        }

        public async Task RejectCall(string caller)
        {
            var callerConn = ConnectedUsers.FirstOrDefault(x => x.Value.Name == caller);
            if (!string.IsNullOrEmpty(callerConn.Key))
                await Clients.Client(callerConn.Key).SendAsync("CallRejected");
        }

        public async Task EndCall(string target)
        {
            var targetConn = ConnectedUsers.FirstOrDefault(x => x.Value.Name == target);
            if (!string.IsNullOrEmpty(targetConn.Key))
                await Clients.Client(targetConn.Key).SendAsync("CallEnded");
        }

        public async Task SendOffer(string target, string offer)
        {
            var targetConn = ConnectedUsers.FirstOrDefault(x => x.Value.Name == target);
            if (!string.IsNullOrEmpty(targetConn.Key))
                await Clients.Client(targetConn.Key).SendAsync("ReceiveOffer", offer);
        }

        public async Task SendAnswer(string target, string answer)
        {
            var targetConn = ConnectedUsers.FirstOrDefault(x => x.Value.Name == target);
            if (!string.IsNullOrEmpty(targetConn.Key))
                await Clients.Client(targetConn.Key).SendAsync("ReceiveAnswer", answer);
        }

        public async Task SendIceCandidate(string target, string candidate)
        {
            var targetConn = ConnectedUsers.FirstOrDefault(x => x.Value.Name == target);
            if (!string.IsNullOrEmpty(targetConn.Key))
                await Clients.Client(targetConn.Key).SendAsync("ReceiveIceCandidate", candidate);
        }
    }
}
