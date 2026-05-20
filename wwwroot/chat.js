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
    const isOwn = user === currentUser;
    const div = document.createElement("div");
    div.className = "message" + (isOwn ? " own" : "");
    div.innerHTML = `
        <div class="message-content">
            <div class="message-user">${user}</div>
            <div class="message-text">${message}</div>
            <div class="message-time">${timestamp}</div>
        </div>`;
    list.appendChild(div);
}

function renderImage(user, imageData, fileName, timestamp) {
    const list = document.getElementById("messagesList");
    const div = document.createElement("div");
    div.className = "message";
    div.innerHTML = `
        <div class="message-content">
            <div class="message-user">${user}</div>
            <img src="${imageData}" alt="${fileName}" style="max-width:300px;border-radius:8px;margin:5px 0;" />
            <div class="message-time">${timestamp}</div>
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
        // Desktop sidebar
        const userDiv = document.createElement("div");
        userDiv.className = "user-item";
        userDiv.innerHTML = `
            <div class="user-avatar">${user.charAt(0).toUpperCase()}</div>
            <div class="user-info"><div class="user-name">${user}</div><div class="user-status">online</div></div>
            ${user !== currentUser ? `
                <button class="btn-call" title="Voice call" onclick="initiateCall('${user}', false)">📞</button>
                <button class="btn-call" title="Video call" onclick="initiateCall('${user}', true)" style="margin-left:2px;">📹</button>
            ` : ''}
        `;
        usersList.appendChild(userDiv);
        // Mobile overlay
        if (mobileUsersList && user !== currentUser) {
            const mobileDiv = document.createElement("div");
            mobileDiv.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#f5f7fa;border-radius:10px;margin-bottom:8px;color:#1e2a35;font-size:15px;";
            mobileDiv.innerHTML = `
                <span style="font-weight:600;">${user}</span>
                <div style="display:flex;gap:8px;">
                    <button onclick="initiateCall('${user}',false);document.getElementById('mobileUsersOverlay').style.display='none';" style="background:#dbeafe;border:1px solid #bfdbfe;color:#1d4ed8;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:14px;">📞</button>
                    <button onclick="initiateCall('${user}',true);document.getElementById('mobileUsersOverlay').style.display='none';" style="background:#dcfce7;border:1px solid #bbf7d0;color:#16a34a;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:14px;">📹</button>
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
        badge.style.cssText = "background:rgba(255,200,0,0.15);color:#ffc800;border:1px solid rgba(255,200,0,0.3);border-radius:20px;padding:2px 10px;font-size:11px;font-weight:600;margin-left:8px;";
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
    // Notify if message is from someone else and tab not focused
    if (user !== currentUser && window.notifyUnread) {
        window.notifyUnread(user, message);
    }
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

// ── Voice / Video Calls ──
let localStream = null;
let peerConnection = null;
let callTarget = null;
let isVideoCall = false;
let screenStream = null;

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
    document.getElementById("acceptCallBtn").style.display = showAccept ? "inline-flex" : "none";
    document.getElementById("acceptVideoBtn").style.display = showAccept ? "inline-flex" : "none";
    document.getElementById("callActiveActions").style.display = "none";
    document.getElementById("videoContainer").style.display = "none";
}

function hideCallOverlay() {
    document.getElementById("callOverlay").classList.remove("active");
    document.getElementById("callActiveActions").style.display = "none";
    document.getElementById("videoContainer").style.display = "none";
    // Stop screen share if active
    stopScreenShare();
}

function stopScreenShare() {
    if (screenStream) {
        screenStream.getTracks().forEach(t => t.stop());
        screenStream = null;
        const btn = document.getElementById("toggleScreenBtn");
        if (btn) { btn.textContent = "🖥️ Share Screen"; btn.style.background = "#f5f7fa"; }
    }
}

function cleanupCall() {
    stopScreenShare();
    if (peerConnection) { peerConnection.close(); peerConnection = null; }
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    isVideoCall = false;
    callTarget = null;
}

function createPeerConnection(target) {
    peerConnection = new RTCPeerConnection(iceServers);
    peerConnection.onicecandidate = function(event) {
        if (event.candidate) connection.invoke("SendIceCandidate", target, JSON.stringify(event.candidate));
    };
    peerConnection.ontrack = function(event) {
        const stream = event.streams[0];
        const audio = document.getElementById("remoteAudio");
        audio.srcObject = stream;
        audio.play().catch(() => {});
        // Show remote video if stream has video tracks
        const remoteVideo = document.getElementById("remoteVideo");
        if (remoteVideo && stream.getVideoTracks().length > 0) {
            remoteVideo.srcObject = stream;
            document.getElementById("videoContainer").style.display = "flex";
        }
    };
    // Handle renegotiation (needed for screen share track replacement)
    peerConnection.onnegotiationneeded = async function() {
        if (!peerConnection || peerConnection.signalingState !== "stable") return;
        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            connection.invoke("SendOffer", callTarget, JSON.stringify(offer));
        } catch(e) { console.warn("Renegotiation failed:", e); }
    };
    if (localStream) localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
}

async function initiateCall(target, withVideo) {
    if (!currentUser) return;
    if (target === currentUser) return;
    callTarget = target;
    isVideoCall = !!withVideo;
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: !!withVideo });
    } catch(e) {
        alert("Could not access microphone" + (withVideo ? "/camera" : "") + ". Please check permissions.");
        return;
    }
    if (withVideo) {
        const localVideo = document.getElementById("localVideo");
        if (localVideo) localVideo.srcObject = localStream;
        document.getElementById("videoContainer").style.display = "flex";
    }
    createPeerConnection(target);
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    connection.invoke("SendOffer", target, JSON.stringify(offer));
    connection.invoke("CallUser", currentUser, target);
    showCallOverlay("Calling...", target, false);
    document.getElementById("callActiveActions").style.display = "flex";
}

connection.on("IncomingCall", function(caller) {
    callTarget = caller;
    showCallOverlay("Incoming Call", caller, true);
});

connection.on("CallAccepted", function() {
    document.getElementById("callStatus").textContent = "Connected";
    document.getElementById("acceptCallBtn").style.display = "none";
    document.getElementById("acceptVideoBtn").style.display = "none";
    document.getElementById("callActiveActions").style.display = "flex";
});

connection.on("CallRejected", function() {
    hideCallOverlay();
    cleanupCall();
    alert("Call was rejected.");
});

connection.on("CallEnded", function() {
    hideCallOverlay();
    cleanupCall();
});

connection.on("ReceiveOffer", async function(offerJson) {
    // If already in a call, handle renegotiation (e.g. screen share)
    if (peerConnection && peerConnection.signalingState !== "closed") {
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(JSON.parse(offerJson)));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            connection.invoke("SendAnswer", callTarget, JSON.stringify(answer));
        } catch(e) { console.warn("Renegotiation receive failed:", e); }
        return;
    }
    // New call offer
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch(e) {
        console.warn("Could not get media:", e);
        return;
    }
    createPeerConnection(callTarget);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(JSON.parse(offerJson)));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    connection.invoke("SendAnswer", callTarget, JSON.stringify(answer));
});

connection.on("ReceiveAnswer", async function(answerJson) {
    if (peerConnection) await peerConnection.setRemoteDescription(new RTCSessionDescription(JSON.parse(answerJson)));
});

connection.on("ReceiveIceCandidate", async function(candidateJson) {
    if (peerConnection) {
        try { await peerConnection.addIceCandidate(new RTCIceCandidate(JSON.parse(candidateJson))); }
        catch(e) { console.warn("ICE candidate error:", e); }
    }
});

document.getElementById("acceptCallBtn").addEventListener("click", async function() {
    // Accept audio only
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch(e) { alert("Could not access microphone."); return; }
    createPeerConnection(callTarget);
    connection.invoke("AcceptCall", callTarget);
    document.getElementById("callStatus").textContent = "Connected";
    document.getElementById("acceptCallBtn").style.display = "none";
    document.getElementById("acceptVideoBtn").style.display = "none";
    document.getElementById("callActiveActions").style.display = "flex";
});

document.getElementById("acceptVideoBtn").addEventListener("click", async function() {
    // Accept with video
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        const localVideo = document.getElementById("localVideo");
        if (localVideo) localVideo.srcObject = localStream;
        document.getElementById("videoContainer").style.display = "flex";
    } catch(e) {
        console.warn("Camera not available, falling back to audio:", e);
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
    createPeerConnection(callTarget);
    connection.invoke("AcceptCall", callTarget);
    document.getElementById("callStatus").textContent = "Connected";
    document.getElementById("acceptCallBtn").style.display = "none";
    document.getElementById("acceptVideoBtn").style.display = "none";
    document.getElementById("callActiveActions").style.display = "flex";
});

document.getElementById("rejectCallBtn").addEventListener("click", function() {
    connection.invoke("EndCall", callTarget);
    hideCallOverlay();
    cleanupCall();
});

document.getElementById("mobileCallBtn").addEventListener("click", function() {
    document.getElementById("mobileUsersOverlay").style.display = "flex";
});

// ── Screen share (in index.html toggleScreenShare uses these) ──
window._getScreenStream = function() { return screenStream; };
window._setScreenStream = function(s) { screenStream = s; };
window._getPeerConnection = function() { return peerConnection; };
window._getLocalStream = function() { return localStream; };

// ── Date Jump Picker (middle-click on chat) ──
let dateJumpActive = false;
let dateJumpDate = new Date();

function openDateJump() {
    dateJumpActive = true;
    dateJumpDate = new Date();
    updateDateJumpDisplay();
    const overlay = document.getElementById("dateJumpOverlay");
    overlay.classList.add("active");
    // Set input to today
    document.getElementById("dateJumpInput").value = toInputDate(dateJumpDate);
}

function closeDateJump() {
    dateJumpActive = false;
    document.getElementById("dateJumpOverlay").classList.remove("active");
}

function toInputDate(date) {
    return date.toISOString().split("T")[0];
}

function updateDateJumpDisplay() {
    const d = dateJumpDate;
    const today = new Date();
    const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
    let label;
    if (d.toDateString() === today.toDateString()) label = "Today";
    else if (d.toDateString() === yesterday.toDateString()) label = "Yesterday";
    else label = d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", year: "numeric" });
    document.getElementById("dateJumpDisplay").textContent = label;
    document.getElementById("dateJumpInput").value = toInputDate(d);
}

function jumpToSelectedDate() {
    const inputVal = document.getElementById("dateJumpInput").value;
    if (inputVal) dateJumpDate = new Date(inputVal + "T00:00:00");
    scrollToDate(dateJumpDate);
    closeDateJump();
}

function scrollToDate(targetDate) {
    const list = document.getElementById("messagesList");
    const separators = list.querySelectorAll(".date-separator span");
    const targetLabel = (() => {
        const today = new Date();
        const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
        if (targetDate.toDateString() === today.toDateString()) return "Today";
        if (targetDate.toDateString() === yesterday.toDateString()) return "Yesterday";
        return targetDate.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    })();

    // Find exact match first
    for (const sep of separators) {
        if (sep.textContent.trim() === targetLabel) {
            sep.closest(".date-separator").scrollIntoView({ behavior: "smooth", block: "start" });
            return;
        }
    }

    // No exact match — find closest date separator
    let closestSep = null;
    let closestDiff = Infinity;
    for (const sep of separators) {
        const text = sep.textContent.trim();
        if (text === "Today" || text === "Yesterday") continue;
        const parsed = new Date(text);
        if (!isNaN(parsed)) {
            const diff = Math.abs(parsed - targetDate);
            if (diff < closestDiff) { closestDiff = diff; closestSep = sep; }
        }
    }
    if (closestSep) closestSep.closest(".date-separator").scrollIntoView({ behavior: "smooth", block: "start" });
}

// Middle-click on messagesList opens picker
document.addEventListener("DOMContentLoaded", function() {
    const list = document.getElementById("messagesList");
    if (!list) return;

    list.addEventListener("mousedown", function(e) {
        if (e.button === 1) { // middle mouse button
            e.preventDefault();
            if (dateJumpActive) closeDateJump();
            else openDateJump();
        }
    });

    // Scroll wheel changes date when picker is open
    document.getElementById("dateJumpOverlay").addEventListener("wheel", function(e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 1 : -1; // down = newer (+1), up = older (-1)
        dateJumpDate.setDate(dateJumpDate.getDate() + delta);
        updateDateJumpDisplay();
    }, { passive: false });

    // Date input change updates display
    document.getElementById("dateJumpInput").addEventListener("change", function() {
        dateJumpDate = new Date(this.value + "T00:00:00");
        updateDateJumpDisplay();
    });

    // Enter key in date input triggers jump
    document.getElementById("dateJumpInput").addEventListener("keypress", function(e) {
        if (e.key === "Enter") jumpToSelectedDate();
    });

    // Escape closes picker
    document.addEventListener("keydown", function(e) {
        if (e.key === "Escape" && dateJumpActive) closeDateJump();
    });
});
