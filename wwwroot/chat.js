const connection = new signalR.HubConnectionBuilder()
    .withUrl("/chatHub")
    .build();

let typingTimer;
const typingDelay = 1000;
let currentUser = "";
let currentProjectId = "default";
let currentUserRole = "member"; // "member" or "viewer"

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

// ── Date separator helpers ──
let lastRenderedDate = null;

function getDateLabel(date) {
    const today = new Date();
    const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    return date.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function maybeInsertDateSeparator(date, container) {
    const label = getDateLabel(date);
    if (lastRenderedDate === label) return;
    lastRenderedDate = label;
    const sep = document.createElement("div");
    sep.className = "date-separator";
    sep.innerHTML = `<span>${label}</span>`;
    container.appendChild(sep);
}

// Load all messages for this project on page load
async function loadMessages() {
    lastRenderedDate = null;
    try {
        const snap = await getDb().collection("messages").doc(currentProjectId)
            .collection("chats").orderBy("timestamp", "asc").get();
        const list = document.getElementById("messagesList");
        snap.forEach(doc => {
            const d = doc.data();
            const date = d.timestamp ? d.timestamp.toDate() : new Date();
            maybeInsertDateSeparator(date, list);
            if (d.type === "text") {
                renderMessage(d.user, d.text, d.timestamp ? formatTime(date) : "");
            } else if (d.type === "image") {
                renderImage(d.user, d.imageData, d.fileName, d.timestamp ? formatTime(date) : "");
            }
        });
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
    const list = document.getElementById("messagesList");
    const initial = user ? user.charAt(0).toUpperCase() : "?";
    const div = document.createElement("div");
    div.className = "message";
    div.innerHTML = `
        <div class="msg-avatar">${initial}</div>
        <div class="msg-body">
            <div class="msg-meta">
                <span class="msg-user">${user}</span>
                <span class="msg-time">${timestamp}</span>
            </div>
            <div class="msg-text">${message}</div>
        </div>`;
    list.appendChild(div);
}

function renderImage(user, imageData, fileName, timestamp) {
    const list = document.getElementById("messagesList");
    const initial = user ? user.charAt(0).toUpperCase() : "?";
    const div = document.createElement("div");
    div.className = "message";
    div.innerHTML = `
        <div class="msg-avatar">${initial}</div>
        <div class="msg-body">
            <div class="msg-meta">
                <span class="msg-user">${user}</span>
                <span class="msg-time">${timestamp}</span>
            </div>
            <div class="msg-text"><img src="${imageData}" alt="${fileName}" /></div>
        </div>`;
    list.appendChild(div);
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
            <span class="user-dot"></span>
            <span class="user-name">${user}</span>
            ${user !== currentUser ? `<button class="btn-call" onclick="initiateCall('${user}',false)" title="Voice call">📞</button><button class="btn-vcall" onclick="initiateCall('${user}',true)" title="Video call">📹</button>` : ''}
        `;
        usersList.appendChild(userDiv);
        if (mobileUsersList && user !== currentUser) {
            const mobileDiv = document.createElement("div");
            mobileDiv.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#f5f7fa;border:1px solid #e8ecef;border-radius:8px;margin-bottom:8px;color:#2c3e50;font-size:14px;";
            mobileDiv.innerHTML = `
                <span style="font-weight:500;">${user}</span>
                <div style="display:flex;gap:6px;">
                    <button onclick="initiateCall('${user}',false);document.getElementById('mobileUsersOverlay').style.display='none';" style="background:#e0f7fa;border:1px solid #b2ebf2;color:#00838f;border-radius:7px;padding:6px 12px;cursor:pointer;font-size:13px;font-weight:600;">📞</button>
                    <button onclick="initiateCall('${user}',true);document.getElementById('mobileUsersOverlay').style.display='none';" style="background:#e8f5e9;border:1px solid #c8e6c9;color:#2e7d32;border-radius:7px;padding:6px 12px;cursor:pointer;font-size:13px;font-weight:600;">📹</button>
                </div>
            `;
            mobileUsersList.appendChild(mobileDiv);
        }
    });
}

// ── Apply role restrictions ──
function applyRoleRestrictions(role) {
    currentUserRole = role || "member";
    if (currentUserRole === "viewer") {
        // Disable chat input
        document.getElementById("messageInput").disabled = true;
        document.getElementById("messageInput").placeholder = "Viewers cannot send messages";
        document.getElementById("sendButton").disabled = true;
        document.getElementById("imageButton").disabled = true;
        // Disable status/blocker post buttons
        const postBtns = document.querySelectorAll(".btn-post");
        postBtns.forEach(b => { b.disabled = true; b.title = "Viewers cannot post"; });
        const textareas = document.querySelectorAll(".standup-post-box textarea");
        textareas.forEach(t => { t.disabled = true; t.placeholder = "Viewers can read but cannot post"; });
        // Show viewer badge
        const badge = document.createElement("span");
        badge.style.cssText = "font-size:11px;font-weight:700;background:#fff8e1;color:#f57f17;border:1px solid #ffe082;border-radius:4px;padding:2px 8px;margin-left:8px;";
        badge.textContent = "Viewer";
        document.getElementById("projectTitle").appendChild(badge);
    }
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
    const list = document.getElementById("messagesList");
    maybeInsertDateSeparator(new Date(), list);
    renderMessage(user, message, timestamp);
    list.scrollTop = list.scrollHeight;
});

connection.on("UserIsTyping", function(user) {
    document.getElementById("typingIndicator").textContent = `${user} is typing...`;
});

connection.on("UserStoppedTyping", function() {
    document.getElementById("typingIndicator").textContent = "";
});

connection.on("ReceiveImage", function(user, imageData, fileName, timestamp) {
    if (!messagesLoaded) { pendingMessages.push({ type: "image", user, imageData, fileName, timestamp }); return; }
    const list = document.getElementById("messagesList");
    maybeInsertDateSeparator(new Date(), list);
    renderImage(user, imageData, fileName, timestamp);
    list.scrollTop = list.scrollHeight;
});

// ── Start connection ──
let messagesLoaded = false;
let pendingMessages = [];

window.startChatConnection = async function(user, projectId, role) {
    if (currentUser) return;
    currentUser = user;
    currentProjectId = projectId;
    applyRoleRestrictions(role);

    try {
        await connection.start();
        document.getElementById("onlineStatus").textContent = "Connected";
        await connection.invoke("JoinChat", currentUser, currentProjectId);
        await loadMessages();
        messagesLoaded = true;
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
    if (currentUserRole === "viewer") return;
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
    if (currentUserRole === "viewer") return;
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
    if (currentUserRole === "viewer") return;
    document.getElementById("imageInput").click();
});

document.getElementById("imageInput").addEventListener("change", function(e) {
    if (currentUserRole === "viewer") return;
    const file = e.target.files[0];
    const user = document.getElementById("userInput").value;
    if (!user) { alert("Please enter your name first!"); return; }
    if (!file || !file.type.startsWith("image/")) return;
    compressImage(file, function(compressedData) {
        connection.invoke("SendImage", user, compressedData, file.name).catch(err => console.error(err));
        saveMessage("image", null, compressedData, file.name);
    });
    e.target.value = "";
});

// ── Voice / Video / Screen Share ──
let localStream = null;
let screenStream = null;
let peerConnection = null;
let callTarget = null;
let isVideoCall = false;
let isMuted = false;
let isCamOff = false;
let isSharingScreen = false;

const iceServers = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
    ]
};

function showCallOverlay(status, name, showAccept, isVideo) {
    document.getElementById("callStatus").textContent = status;
    document.getElementById("callName").textContent = name;
    document.getElementById("callTypeBadge").textContent = isVideo ? "📹 Video Call" : "📞 Voice Call";
    document.getElementById("callOverlay").classList.add("active");
    document.getElementById("callActionsIncoming").style.display = showAccept ? "flex" : "none";
    document.getElementById("callActionsActive").style.display = showAccept ? "none" : "flex";
    const videoArea = document.getElementById("callVideoArea");
    if (isVideo) { videoArea.classList.add("active"); document.getElementById("callAvatar").style.display = "none"; }
    else { videoArea.classList.remove("active"); document.getElementById("callAvatar").style.display = "flex"; }
    document.getElementById("camBtnWrap").style.display = isVideo ? "flex" : "none";
    document.getElementById("screenBtnWrap").style.display = "flex";
}

function hideCallOverlay() {
    document.getElementById("callOverlay").classList.remove("active");
    document.getElementById("callVideoArea").classList.remove("active");
    document.getElementById("callActionsIncoming").style.display = "flex";
    document.getElementById("callActionsActive").style.display = "none";
    document.getElementById("callAvatar").style.display = "flex";
    isMuted = false; isCamOff = false; isSharingScreen = false;
    document.getElementById("btnMute").classList.remove("active");
    document.getElementById("btnCam").classList.remove("active");
    document.getElementById("btnScreen").classList.remove("active");
    document.getElementById("muteLabel").textContent = "Mute";
    document.getElementById("camLabel").textContent = "Camera";
    document.getElementById("screenLabel").textContent = "Share";
}

function createPeerConnection(target) {
    peerConnection = new RTCPeerConnection(iceServers);
    peerConnection.onicecandidate = function(event) {
        if (event.candidate) connection.invoke("SendIceCandidate", target, JSON.stringify(event.candidate));
    };
    peerConnection.ontrack = function(event) {
        if (isVideoCall) {
            const remoteVideo = document.getElementById("remoteVideo");
            remoteVideo.srcObject = event.streams[0];
            remoteVideo.play().catch(e => console.warn("remoteVideo play:", e));
        } else {
            const audio = document.getElementById("remoteAudio");
            audio.srcObject = event.streams[0];
            audio.play().catch(e => console.warn("remoteAudio play:", e));
        }
    };
    if (localStream) localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
}

async function initiateCall(target, withVideo) {
    if (!currentUser || target === currentUser) return;
    isVideoCall = !!withVideo;
    callTarget = target;
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideoCall });
        if (isVideoCall) document.getElementById("localVideo").srcObject = localStream;
        createPeerConnection(target);
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        connection.invoke("SendOffer", target, JSON.stringify(offer));
        if (isVideoCall) { connection.invoke("VideoCallUser", currentUser, target); }
        else { connection.invoke("CallUser", currentUser, target); }
        showCallOverlay("Calling...", target, false, isVideoCall);
    } catch(err) {
        alert("Could not access " + (isVideoCall ? "camera/microphone" : "microphone") + ". Check permissions.");
        console.error(err);
    }
}

function toggleMute() {
    if (!localStream) return;
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
    const btn = document.getElementById("btnMute");
    btn.classList.toggle("active", isMuted);
    btn.textContent = isMuted ? "🔇" : "🎤";
    document.getElementById("muteLabel").textContent = isMuted ? "Unmute" : "Mute";
}

function toggleCamera() {
    if (!localStream || !isVideoCall) return;
    isCamOff = !isCamOff;
    localStream.getVideoTracks().forEach(t => t.enabled = !isCamOff);
    const btn = document.getElementById("btnCam");
    btn.classList.toggle("active", isCamOff);
    btn.textContent = isCamOff ? "🚫" : "📹";
    document.getElementById("camLabel").textContent = isCamOff ? "Start Cam" : "Camera";
}

async function toggleScreenShare() {
    if (!peerConnection) return;
    if (!isSharingScreen) {
        try {
            screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
            const screenTrack = screenStream.getVideoTracks()[0];
            const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === "video");
            if (sender) { sender.replaceTrack(screenTrack); }
            else { peerConnection.addTrack(screenTrack, screenStream); }
            if (isVideoCall) document.getElementById("localVideo").srcObject = screenStream;
            screenTrack.onended = () => { stopScreenShare(); };
            isSharingScreen = true;
            document.getElementById("btnScreen").classList.add("active");
            document.getElementById("btnScreen").textContent = "⏹️";
            document.getElementById("screenLabel").textContent = "Stop";
        } catch(err) { console.error("Screen share failed:", err); }
    } else { stopScreenShare(); }
}

function stopScreenShare() {
    if (!screenStream) return;
    screenStream.getTracks().forEach(t => t.stop());
    screenStream = null;
    if (isVideoCall && localStream) {
        const camTrack = localStream.getVideoTracks()[0];
        const sender = peerConnection && peerConnection.getSenders().find(s => s.track && s.track.kind === "video");
        if (sender && camTrack) sender.replaceTrack(camTrack);
        document.getElementById("localVideo").srcObject = localStream;
    }
    isSharingScreen = false;
    document.getElementById("btnScreen").classList.remove("active");
    document.getElementById("btnScreen").textContent = "🖥️";
    document.getElementById("screenLabel").textContent = "Share";
}

function endActiveCall() {
    connection.invoke("EndCall", callTarget);
    cleanupCall();
}

function cleanupCall() {
    hideCallOverlay();
    stopScreenShare();
    if (peerConnection) { peerConnection.close(); peerConnection = null; }
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    const rv = document.getElementById("remoteVideo");
    const lv = document.getElementById("localVideo");
    if (rv) rv.srcObject = null;
    if (lv) lv.srcObject = null;
    callTarget = null; isVideoCall = false;
}

connection.on("IncomingCall", function(caller) { callTarget = caller; isVideoCall = false; showCallOverlay("Incoming Voice Call", caller, true, false); });
connection.on("IncomingVideoCall", function(caller) { callTarget = caller; isVideoCall = true; showCallOverlay("Incoming Video Call", caller, true, true); });
connection.on("CallAccepted", function() {
    document.getElementById("callStatus").textContent = "Connected";
    document.getElementById("callActionsIncoming").style.display = "none";
    document.getElementById("callActionsActive").style.display = "flex";
});
connection.on("CallRejected", function() { cleanupCall(); alert("Call was declined."); });
connection.on("CallEnded", function() { cleanupCall(); });

connection.on("ReceiveOffer", async function(offerJson) {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideoCall });
        if (isVideoCall) {
            document.getElementById("localVideo").srcObject = localStream;
            document.getElementById("callVideoArea").classList.add("active");
            document.getElementById("callAvatar").style.display = "none";
        }
        createPeerConnection(callTarget);
        await peerConnection.setRemoteDescription(new RTCSessionDescription(JSON.parse(offerJson)));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        connection.invoke("SendAnswer", callTarget, JSON.stringify(answer));
        document.getElementById("callStatus").textContent = "Connected";
        document.getElementById("callActionsIncoming").style.display = "none";
        document.getElementById("callActionsActive").style.display = "flex";
        document.getElementById("camBtnWrap").style.display = isVideoCall ? "flex" : "none";
    } catch(err) { console.error("ReceiveOffer error:", err); cleanupCall(); }
});

connection.on("ReceiveAnswer", async function(answerJson) {
    if (peerConnection) await peerConnection.setRemoteDescription(new RTCSessionDescription(JSON.parse(answerJson)));
});

connection.on("ReceiveIceCandidate", async function(candidateJson) {
    if (peerConnection) await peerConnection.addIceCandidate(new RTCIceCandidate(JSON.parse(candidateJson)));
});

document.getElementById("acceptCallBtn").addEventListener("click", async function() {
    connection.invoke("AcceptCall", callTarget);
    try {
        if (!localStream) {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideoCall });
            if (isVideoCall) {
                document.getElementById("localVideo").srcObject = localStream;
                document.getElementById("callVideoArea").classList.add("active");
                document.getElementById("callAvatar").style.display = "none";
            }
        }
    } catch(err) { console.error("Accept call media error:", err); }
    document.getElementById("callStatus").textContent = "Connecting...";
    document.getElementById("callActionsIncoming").style.display = "none";
    document.getElementById("callActionsActive").style.display = "flex";
    document.getElementById("camBtnWrap").style.display = isVideoCall ? "flex" : "none";
});

document.getElementById("rejectCallBtn").addEventListener("click", function() {
    connection.invoke("RejectCall", callTarget);
    cleanupCall();
});

document.getElementById("mobileCallBtn").addEventListener("click", function() {
    document.getElementById("mobileUsersOverlay").style.display = "flex";
});
