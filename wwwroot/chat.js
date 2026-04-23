const connection = new signalR.HubConnectionBuilder()
    .withUrl("/chatHub")
    .build();

let typingTimer;
const typingDelay = 1000; // 1 second
let currentUser = "";

// Function to update online users list
function updateUsersList(users) {
    const usersList = document.getElementById("usersList");
    const userCount = document.getElementById("userCount");
    
    userCount.textContent = users.length;
    usersList.innerHTML = "";
    
    users.forEach(function(user) {
        const userDiv = document.createElement("div");
        userDiv.className = "user-item";
        userDiv.textContent = user;
        usersList.appendChild(userDiv);
    });
}

// User joined
connection.on("UserJoined", function (username, users) {
    updateUsersList(users);
    
    // Show notification
    const messageDiv = document.createElement("div");
    messageDiv.className = "message";
    messageDiv.innerHTML = `
        <div class="message-content" style="background: #e8f5e9; text-align: center;">
            <div class="message-text" style="color: #2e7d32; font-style: italic;">
                ${username} joined the chat
            </div>
        </div>
    `;
    document.getElementById("messagesList").appendChild(messageDiv);
    
    const messagesList = document.getElementById("messagesList");
    messagesList.scrollTop = messagesList.scrollHeight;
});

// User left
connection.on("UserLeft", function (username, users) {
    updateUsersList(users);
    
    // Show notification
    const messageDiv = document.createElement("div");
    messageDiv.className = "message";
    messageDiv.innerHTML = `
        <div class="message-content" style="background: #ffebee; text-align: center;">
            <div class="message-text" style="color: #c62828; font-style: italic;">
                ${username} left the chat
            </div>
        </div>
    `;
    document.getElementById("messagesList").appendChild(messageDiv);
    
    const messagesList = document.getElementById("messagesList");
    messagesList.scrollTop = messagesList.scrollHeight;
});

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
        // Join chat if first message
        if (!currentUser) {
            currentUser = user;
            connection.invoke("JoinChat", user);
            document.getElementById("userInput").disabled = true;
        }
        
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
// Handle image button click
document.getElementById("imageButton").addEventListener("click", function () {
    document.getElementById("imageInput").click();
});

// Handle image selection
document.getElementById("imageInput").addEventListener("change", function (e) {
    const file = e.target.files[0];
    const user = document.getElementById("userInput").value;
    
    if (!user) {
        alert("Please enter your name first!");
        return;
    }
    
    if (file && file.type.startsWith("image/")) {
        const reader = new FileReader();
        
        reader.onload = function (event) {
            const imageData = event.target.result;
            connection.invoke("SendImage", user, imageData, file.name).catch(function (err) {
                return console.error(err.toString());
            });
        };
        
        reader.readAsDataURL(file);
        e.target.value = ""; // Clear input
    }
});

// Listen for incoming images
connection.on("ReceiveImage", function (user, imageData, fileName, timestamp) {
    const messageDiv = document.createElement("div");
    messageDiv.className = "message";
    messageDiv.innerHTML = `
        <div class="message-content">
            <div class="message-user">${user}</div>
            <img src="${imageData}" alt="${fileName}" style="max-width: 300px; border-radius: 8px; margin: 5px 0;" />
            <div class="message-time">${timestamp}</div>
        </div>
    `;
    document.getElementById("messagesList").appendChild(messageDiv);
    
    // Auto scroll to bottom
    const messagesList = document.getElementById("messagesList");
    messagesList.scrollTop = messagesList.scrollHeight;
});
