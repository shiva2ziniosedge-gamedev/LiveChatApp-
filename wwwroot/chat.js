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
    document.getElementById("messagesList").scrollTop = document.getElementById("messagesList").scrollHeight;
});

// User left
connection.on("UserLeft", function (username, users) {
    updateUsersList(users);
    const div = document.createElement("div");
    div.className = "notification";
    div.innerHTML = `<span>${username} left the chat</span>`;
    document.getElementById("messagesList").appendChild(div);
    document.getElementById("messagesList").scrollTop = document.getElementById("messagesList").scrollHeight;
});

// Receive messages
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
    document.getElementById("messagesList").scrollTop = document.getElementById("messagesList").scrollHeight;
});

connection.on("UserIsTyping", function (user) {
    document.getElementById("typingIndicator").textContent = `${user} is typing...`;
});

connection.on("UserStoppedTyping", function (user) {
    document.getElementById("typingIndicator").textContent = "";
});

// Start connection
connection.start()
    .then(function() {
        document.getElementById("onlineStatus").textContent = "Connected";
        // Auto-join if userInput already populated (Firebase set it before connection started)
        const user = document.getElementById("userInput").value;
        const projectId = window._chatProjectId || "default";
        if (user && !currentUser) {
            currentUser = user;
            connection.invoke("JoinChat", user, projectId);
        }
    })
    .catch(function (err) {
        document.getElementById("onlineStatus").textContent = "Disconnected";
        return console.error(err.toString());
    });

// Send message
document.getElementById("sendButton").addEventListener("click", function () {
    const user = document.getElementById("userInput").value;
    const message = document.getElementById("messageInput").value;
    const projectId = window._chatProjectId || "default";

    if (user && message) {
        if (!currentUser) {
            currentUser = user;
            connection.invoke("JoinChat", user, projectId);
            document.getElementById("userInput").disabled = true;
        }
        connection.invoke("SendMessage", user, message).catch(function (err) {
            return console.error(err.toString());
        });
        connection.invoke("UserStoppedTyping", user);
        document.getElementById("messageInput").value = "";
    }
});

// Typing detection
document.getElementById("messageInput").addEventListener("input", function () {
    const user = document.getElementById("userInput").value;
    if (user) {
        connection.invoke("UserTyping", user);
        clearTimeout(typingTimer);
        typingTimer = setTimeout(function () {
            connection.invoke("UserStoppedTyping", user);
        }, typingDelay);
    }
});

document.getElementById("messageInput").addEventListener("keypress", function (e) {
    if (e.key === "Enter") document.getElementById("sendButton").click();
});

// Image
document.getElementById("imageButton").addEventListener("click", function () {
    document.getElementById("imageInput").click();
});

document.getElementById("imageInput").addEventListener("change", function (e) {
    const file = e.target.files[0];
    const user = document.getElementById("userInput").value;
    if (!user) { alert("Please enter your name first!"); return; }
    if (file && file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = function (event) {
            connection.invoke("SendImage", user, event.target.result, file.name).catch(function (err) {
                return console.error(err.toString());
            });
        };
        reader.readAsDataURL(file);
        e.target.value = "";
    }
});

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
    document.getElementById("messagesList").scrollTop = document.getElementById("messagesList").scrollHeight;
});

// ── Voice Calls ──
let localStream = null;
let peerConnection = null;
let callTarget = null;

const iceServers = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
    ]
};

function showCallOverlay(status, name, showAccept) {
    document.getElementById("callStatus").textContent = status;
    document.getElementById("callName").textContent = name;
    document.getElementById("callOverlay").classList.add("active");
    document.getElementById("acceptCallBtn").style.display = showAccept ? "block" : "none";
    document.getElementById("rejectCallBtn").innerHTML = showAccept ? "📵" : "📵";
}

function hideCallOverlay() {
    document.getElementById("callOverlay").classList.remove("active");
}

function createPeerConnection(target) {
    peerConnection = new RTCPeerConnection(iceServers);
    peerConnection.onicecandidate = function(event) {
        if (event.candidate) connection.invoke("SendIceCandidate", target, JSON.stringify(event.candidate));
    };
    peerConnection.ontrack = function(event) {
        const audio = document.getElementById("remoteAudio");
        audio.srcObject = event.streams[0];
        audio.play();
    };
    if (localStream) localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
}

async function initiateCall(target) {
    if (!currentUser) { alert("Please enter your name and send a message first!"); return; }
    if (target === currentUser) return;
    callTarget = target;
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    createPeerConnection(target);
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    connection.invoke("SendOffer", target, JSON.stringify(offer));
    connection.invoke("CallUser", currentUser, target);
    showCallOverlay("Calling...", target, false);
}

connection.on("IncomingCall", function(caller) { callTarget = caller; showCallOverlay("Incoming Call", caller, true); });
connection.on("CallAccepted", async function() { document.getElementById("callStatus").textContent = "Connected"; document.getElementById("acceptCallBtn").style.display = "none"; });
connection.on("CallRejected", function() { hideCallOverlay(); if (peerConnection) { peerConnection.close(); peerConnection = null; } if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; } alert("Call was rejected."); });
connection.on("CallEnded", function() { hideCallOverlay(); if (peerConnection) { peerConnection.close(); peerConnection = null; } if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; } });

connection.on("ReceiveOffer", async function(offerJson) {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    createPeerConnection(callTarget);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(JSON.parse(offerJson)));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    connection.invoke("SendAnswer", callTarget, JSON.stringify(answer));
});

connection.on("ReceiveAnswer", async function(answerJson) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(JSON.parse(answerJson)));
});

connection.on("ReceiveIceCandidate", async function(candidateJson) {
    if (peerConnection) await peerConnection.addIceCandidate(new RTCIceCandidate(JSON.parse(candidateJson)));
});

document.getElementById("acceptCallBtn").addEventListener("click", function() {
    connection.invoke("AcceptCall", callTarget);
    document.getElementById("callStatus").textContent = "Connected";
    document.getElementById("acceptCallBtn").style.display = "none";
});

document.getElementById("rejectCallBtn").addEventListener("click", function() {
    connection.invoke("EndCall", callTarget);
    hideCallOverlay();
    if (peerConnection) { peerConnection.close(); peerConnection = null; }
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    callTarget = null;
});

document.getElementById("mobileCallBtn").addEventListener("click", function() {
    document.getElementById("mobileUsersOverlay").style.display = "flex";
});
