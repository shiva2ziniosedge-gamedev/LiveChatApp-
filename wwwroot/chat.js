const connection = new signalR.HubConnectionBuilder()
    .withUrl("/chatHub")
    .build();

let typingTimer;
const typingDelay = 1000; // 1 second

// Receive messages from server
connection.on("ReceiveMessage", function (user, message, timestamp) {
    const messageDiv = document.createElement("div");
    messageDiv.className = "message";
    messageDiv.innerHTML = `
        <div class="message-content">
            <div class="message-user">${user}</div>
            <div class="message-text">${message}</div>
            <div class="message-time">${timestamp}</div>
        </div>
    `;
    document.getElementById("messagesList").appendChild(messageDiv);
    
    // Auto scroll to bottom
    const messagesList = document.getElementById("messagesList");
    messagesList.scrollTop = messagesList.scrollHeight;
});

// Show typing indicator
connection.on("UserIsTyping", function (user) {
    document.getElementById("typingIndicator").textContent = `${user} is typing...`;
});

// Hide typing indicator
connection.on("UserStoppedTyping", function (user) {
    document.getElementById("typingIndicator").textContent = "";
});

// Start connection
connection.start().catch(function (err) {
    return console.error(err.toString());
});

// Send message when button clicked
document.getElementById("sendButton").addEventListener("click", function () {
    const user = document.getElementById("userInput").value;
    const message = document.getElementById("messageInput").value;
    
    if (user && message) {
        connection.invoke("SendMessage", user, message).catch(function (err) {
            return console.error(err.toString());
        });
        
        // Stop typing indicator
        connection.invoke("UserStoppedTyping", user);
        
        // Clear message input after sending
        document.getElementById("messageInput").value = "";
    }
});

// Detect typing
document.getElementById("messageInput").addEventListener("input", function () {
    const user = document.getElementById("userInput").value;
    
    if (user) {
        // Tell others user is typing
        connection.invoke("UserTyping", user);
        
        // Clear previous timer
        clearTimeout(typingTimer);
        
        // Set timer to stop typing indicator after 1 second of no typing
        typingTimer = setTimeout(function () {
            connection.invoke("UserStoppedTyping", user);
        }, typingDelay);
    }
});

// Send message on Enter key
document.getElementById("messageInput").addEventListener("keypress", function (e) {
    if (e.key === "Enter") {
        document.getElementById("sendButton").click();
    }
});
