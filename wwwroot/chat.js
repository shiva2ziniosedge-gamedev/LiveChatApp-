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
    const mobileUsersList = document.getElementById("mobileUsersList");
    
    userCount.textContent = users.length;
    usersList.innerHTML = "";
    if (mobileUsersList) mobileUsersList.innerHTML = "";
    
    users.forEach(function(user) {
        // Desktop sidebar
        const userDiv = document.createElement("div");
        userDiv.className = "user-item";
        userDiv.innerHTML = `
            <span class="user-name">${user}</span>
            ${user !== currentUser ? `<button class="btn-call" onclick="initiateCall('${user}')">📞</button>` : ''}
        `;
        usersList.appendChild(userDiv);

        // Mobile popup list
        if (mobileUsersList && user !== currentUser) {
            const mobileDiv = document.createElement("div");
            mobileDiv.style.cssText = "display:flex; align-items:center; justify-content:space-between; padding:12px 16px; background:rgba(255,255,255,0.08); border-radius:10px; margin-bottom:8px; color:rgba(255,255,255,0.9); font-size:15px;";
            mobileDiv.innerHTML = `
                <span>${user}</span>
                <button onclick="initiateCall('${user}'); document.getElementById('mobileUsersOverlay').style.display='none';" style="background:rgba(0,229,160,0.2); border:1px solid rgba(0,229,160,0.3); color:#00e5a0; border-radius:8px; padding:6px 14px; cursor:pointer; font-size:14px;">📞 Call</button>
            `;
            mobileUsersList.appendChild(mobileDiv);
        }
    });
}

// User joined
connection.on("UserJoined", function (username, users) {
    updateUsersList(users);
    
    const div = document.createElement("div");
    div.className = "notification";
    div.innerHTML = `<span>${username} joined the chat</span>`;
    document.getElementById("messagesList").appendChild(div);
    
    const messagesList = document.getElementById("messagesList");
    messagesList.scrollTop = messagesList.scrollHeight;
});

// User left
connection.on("UserLeft", function (username, users) {
    updateUsersList(users);
    
    const div = document.createElement("div");
    div.className = "notification";
    div.innerHTML = `<span>${username} left the chat</span>`;
    document.getElementById("messagesList").appendChild(div);
    
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
connection.start()
    .then(function() {
        document.getElementById("onlineStatus").textContent = "Connected";
    })
    .catch(function (err) {
        document.getElementById("onlineStatus").textContent = "Disconnected";
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





// ─────────────────────────────────────────────────────────────────────────────
// VOICE CALL FEATURES
// Uses WebRTC for peer-to-peer audio and SignalR for call signaling
// Flow: initiateCall → CallUser (SignalR) → IncomingCall → AcceptCall → WebRTC
// ─────────────────────────────────────────────────────────────────────────────

let localStream = null;
let peerConnection = null;
let callTarget = null;

// ICE servers for WebRTC peer connection (STUN helps with NAT traversal)
const iceServers = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
    ]
};

// Show the call overlay with given status and name
function showCallOverlay(status, name, showAccept) {
    document.getElementById("callStatus").textContent = status;
    document.getElementById("callName").textContent = name;
    document.getElementById("callOverlay").classList.add("active");
    document.getElementById("acceptCallBtn").style.display = showAccept ? "block" : "none";
    document.getElementById("rejectCallBtn").innerHTML = showAccept ? "📵" : "📵";
}

// Hide the call overlay
function hideCallOverlay() {
    document.getElementById("callOverlay").classList.remove("active");
}

// Create WebRTC peer connection and set up event handlers
function createPeerConnection(target) {
    peerConnection = new RTCPeerConnection(iceServers);

    // When ICE candidate is found, send it to the other peer via SignalR
    peerConnection.onicecandidate = function(event) {
        if (event.candidate) {
            connection.invoke("SendIceCandidate", target, JSON.stringify(event.candidate));
        }
    };

    // When remote audio track arrives, play it through speakers
    peerConnection.ontrack = function(event) {
        const audio = document.getElementById("remoteAudio");
        audio.srcObject = event.streams[0];
        audio.play();
    };

    // Add local mic stream tracks to the peer connection
    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }
}

// Called when user clicks the call button next to a user's name
async function initiateCall(target) {
    if (!currentUser) {
        alert("Please enter your name and send a message first!");
        return;
    }
    if (target === currentUser) return;

    callTarget = target;

    // Request mic access from browser
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

    createPeerConnection(target);

    // Create SDP offer and send to target via SignalR
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    connection.invoke("SendOffer", target, JSON.stringify(offer));

    // Notify target user via SignalR
    connection.invoke("CallUser", currentUser, target);

    showCallOverlay("Calling...", target, false);
}

// SignalR: incoming call from another user
connection.on("IncomingCall", function(caller) {
    callTarget = caller;
    showCallOverlay("Incoming Call", caller, true);
});

// SignalR: target accepted the call
connection.on("CallAccepted", async function(accepter) {
    document.getElementById("callStatus").textContent = "Connected";
    document.getElementById("acceptCallBtn").style.display = "none";
});

// SignalR: target rejected the call
connection.on("CallRejected", function() {
    hideCallOverlay();
    if (peerConnection) { peerConnection.close(); peerConnection = null; }
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    alert("Call was rejected.");
});

// SignalR: other user ended the call
connection.on("CallEnded", function() {
    hideCallOverlay();
    if (peerConnection) { peerConnection.close(); peerConnection = null; }
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
});

// SignalR: receive WebRTC SDP offer from caller
connection.on("ReceiveOffer", async function(offerJson) {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    createPeerConnection(callTarget);

    const offer = JSON.parse(offerJson);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    // Create answer and send back via SignalR
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    connection.invoke("SendAnswer", callTarget, JSON.stringify(answer));
});

// SignalR: receive WebRTC SDP answer from callee
connection.on("ReceiveAnswer", async function(answerJson) {
    const answer = JSON.parse(answerJson);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
});

// SignalR: receive ICE candidate from other peer
connection.on("ReceiveIceCandidate", async function(candidateJson) {
    const candidate = JSON.parse(candidateJson);
    if (peerConnection) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
});

// Accept button clicked on incoming call overlay
document.getElementById("acceptCallBtn").addEventListener("click", function() {
    connection.invoke("AcceptCall", callTarget);
    document.getElementById("callStatus").textContent = "Connected";
    document.getElementById("acceptCallBtn").style.display = "none";
});

// Reject/End button clicked on call overlay
document.getElementById("rejectCallBtn").addEventListener("click", function() {
    connection.invoke("EndCall", callTarget);
    hideCallOverlay();
    if (peerConnection) { peerConnection.close(); peerConnection = null; }
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    callTarget = null;
});

// Mobile call button - opens users popup
document.getElementById("mobileCallBtn").addEventListener("click", function() {
    document.getElementById("mobileUsersOverlay").style.display = "flex";
});
