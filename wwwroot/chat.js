const connection = new signalR.HubConnectionBuilder()
    .withUrl("/chatHub")
    .build();

let typingTimer;
const typingDelay = 1000;
let currentUser = "";
let currentProjectId = "default";

// ── Firestore helpers ──
function getDb() { return firebase.firestore(); }

// Save message to Firestore
async function saveMessage(type, text, imageData, fileName) {
    try {
        await getDb().collection("messages").doc(currentProjectId)
            .collection("chats").add({
                user: currentUser,
                type: type,
                text: text || null,
                imageData: imageData || null,
                fileName: fileName || null,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
    } catch(e) {
        console.warn("Failed to save message:", e);
    }
}

// Load all messages for this project on page load
async function loadMessages() {
    try {
        const snap = await getDb().collection("messages").doc(currentProjectId)
            .collection("chats").orderBy("timestamp", "asc").get();
        snap.forEach(doc => {
            const d = doc.data();
            if (d.type === "text") {
                renderMessage(d.user, d.text, d.timestamp ? formatTime(d.timestamp.toDate()) : "");
            } else if (d.type === "image") {
                renderImage(d.user, d.imageData, d.fileName, d.timestamp ? formatTime(d.timestamp.toDate()) : "");
            }
        });
        const list = document.getElementById("messagesList");
        list.scrollTop = list.scrollHeight;
    } catch(e) {
        console.warn("Failed to load messages:", e);
    }
}

function formatTime(date) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Compress image before storing (keeps under Firestore 1MB limit)
function compressImage(file, callback) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement("canvas");
            const maxW = 800;
            let w = img.width, h = img.height;
            if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
            canvas.width = w; canvas.height = h;
            canvas.getContext("2d").drawImage(img, 0, 0, w, h);
            callback(canvas.toDataURL("image/jpeg", 0.7));
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// ── Render helpers ──
function renderMessage(user, message, timestamp) {
    const div = document.createElement("div");
    div.className = "message";
    div.innerHTML = `
        <div class="message-content">
            <div class="message-user">${user}</div>
            <div class="message-text">${message}</div>
            <div class="message-time">${timestamp}</div>
        </div>`;
    document.getElementById("messagesList").appendChild(div);
}

function renderImage(user, imageData, fileName, timestamp) {
    const div = document.createElement("div");
    div.className = "message";
    div.innerHTML = `
        <div class="message-content">
            <div class="message-user">${user}</div>
            <img src="${imageData}" alt="${fileName}" style="max-width:300px;border-radius:8px;margin:5px 0;" />
            <div class="message-time">${timestamp}</div>
        </div>`;
    document.getElementById("messagesList").appendChild(div);
}

// ── Users list ──
function updateUsersList(users) {
    const usersList = document.getElementById("usersList");
    const userCount = document.getElementById("userCount");
    const mobileUsersList = document.getElementById("mobileUsersList");
    userCount.textContent = users.length;
    usersList.innerHTML = "";
    if (mobileUsersList) mobileUsersList.innerHTML = "";
    users.forEach(function(user) {
        const userDiv = document.createElement("div");
        userDiv.className = "user-item";
        userDiv.innerHTML = `
            <span class="user-name">${user}</span>
            ${user !== currentUser ? `<button class="btn-call" onclick="initiateCall('${user}')">📞</button>` : ''}
        `;
        usersList.appendChild(userDiv);
        if (mobileUsersList && user !== currentUser) {
            const mobileDiv = document.createElement("div");
            mobileDiv.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:rgba(255,255,255,0.08);border-radius:10px;margin-bottom:8px;color:rgba(255,255,255,0.9);font-size:15px;";
            mobileDiv.innerHTML = `
                <span>${user}</span>
                <button onclick="initiateCall('${user}');document.getElementById('mobileUsersOverlay').style.display='none';" style="background:rgba(0,229,160,0.2);border:1px solid rgba(0,229,160,0.3);color:#00e5a0;border-radius:8px;padding:6px 14px;cursor:pointer;font-size:14px;">📞 Call</button>
            `;
            mobileUsersList.appendChild(mobileDiv);
        }
    });
}

// ── SignalR events ──
connection.on("UserJoined", function(username, users) {
    updateUsersList(users);
    const div = document.createElement("div");
    div.className = "notification";
    div.innerHTML = `<span>${username} joined the chat</span>`;
    document.getElementById("messagesList").appendChild(div);
    document.getElementById("messagesList").scrollTop = document.getElementById("messagesList").scrollHeight;
});

connection.on("UserLeft", function(username, users) {
    updateUsersList(users);
    const div = document.createElement("div");
    div.className = "notification";
    div.innerHTML = `<span>${username} left the chat</span>`;
    document.getElementById("messagesList").appendChild(div);
    document.getElementById("messagesList").scrollTop = document.getElementById("messagesList").scrollHeight;
});

connection.on("ReceiveMessage", function(user, message, timestamp) {
    if (!messagesLoaded) { pendingMessages.push({ type: "text", user, text: message, timestamp }); return; }
    renderMessage(user, message, timestamp);
    document.getElementById("messagesList").scrollTop = document.getElementById("messagesList").scrollHeight;
});

connection.on("UserIsTyping", function(user) {
    document.getElementById("typingIndicator").textContent = `${user} is typing...`;
});

connection.on("UserStoppedTyping", function() {
    document.getElementById("typingIndicator").textContent = "";
});

connection.on("ReceiveImage", function(user, imageData, fileName, timestamp) {
    if (!messagesLoaded) { pendingMessages.push({ type: "image", user, imageData, fileName, timestamp }); return; }
    renderImage(user, imageData, fileName, timestamp);
    document.getElementById("messagesList").scrollTop = document.getElementById("messagesList").scrollHeight;
});

// ── Start connection (called from index.html once auth is confirmed) ──
let messagesLoaded = false;
let pendingMessages = []; // buffer SignalR messages that arrive before history loads

window.startChatConnection = async function(user, projectId) {
    if (currentUser) return;
    currentUser = user;
    currentProjectId = projectId;

    try {
        await connection.start();
        document.getElementById("onlineStatus").textContent = "Connected";
        await connection.invoke("JoinChat", currentUser, currentProjectId);
        await loadMessages(); // wait for full history before rendering anything new
        messagesLoaded = true;
        // flush any messages that arrived while history was loading
        pendingMessages.forEach(function(m) {
            if (m.type === "text") renderMessage(m.user, m.text, m.timestamp);
            else if (m.type === "image") renderImage(m.user, m.imageData, m.fileName, m.timestamp);
        });
        pendingMessages = [];
        const list = document.getElementById("messagesList");
        list.scrollTop = list.scrollHeight;
    } catch(err) {
        document.getElementById("onlineStatus").textContent = "Disconnected";
        console.error(err.toString());
    }
};

// ── Send message ──
document.getElementById("sendButton").addEventListener("click", function() {
    const user = document.getElementById("userInput").value;
    const message = document.getElementById("messageInput").value.trim();
    if (user && message) {
        connection.invoke("SendMessage", user, message).catch(err => console.error(err));
        saveMessage("text", message, null, null);
        connection.invoke("UserStoppedTyping", user);
        document.getElementById("messageInput").value = "";
    }
});

document.getElementById("messageInput").addEventListener("input", function() {
    const user = document.getElementById("userInput").value;
    if (user) {
        connection.invoke("UserTyping", user);
        clearTimeout(typingTimer);
        typingTimer = setTimeout(function() {
            connection.invoke("UserStoppedTyping", user);
        }, typingDelay);
    }
});

document.getElementById("messageInput").addEventListener("keypress", function(e) {
    if (e.key === "Enter") document.getElementById("sendButton").click();
});

// ── Image ──
document.getElementById("imageButton").addEventListener("click", function() {
    document.getElementById("imageInput").click();
});

document.getElementById("imageInput").addEventListener("change", function(e) {
    const file = e.target.files[0];
    const user = document.getElementById("userInput").value;
    if (!user) { alert("Please enter your name first!"); return; }
    if (!file || !file.type.startsWith("image/")) return;

    compressImage(file, function(compressedData) {
        // Send via SignalR to online users
        connection.invoke("SendImage", user, compressedData, file.name).catch(err => console.error(err));
        // Save to Firestore for history
        saveMessage("image", null, compressedData, file.name);
    });
    e.target.value = "";
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
connection.on("CallAccepted", function() { document.getElementById("callStatus").textContent = "Connected"; document.getElementById("acceptCallBtn").style.display = "none"; });
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
