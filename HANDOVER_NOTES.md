# TeamChat — Handover Notes
**Date:** Monday, May 19, 2026  
**Prepared for:** Next developer / Kiro session

---

## Quick Start

```bash
git clone https://github.com/shiva2ziniosedge-gamedev/LiveChatApp-
cd LiveChatApp-
git checkout monday-user-login-crashed
dotnet run
# Open: http://localhost:5300
```

**Requires:** .NET 8 SDK (not 9 — csproj is set to net8.0)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | ASP.NET Core 8, SignalR |
| Frontend | Vanilla HTML/CSS/JS (no frameworks) |
| Auth | Firebase Authentication (email/password) |
| Database | Firebase Firestore |
| Calls | WebRTC (peer-to-peer, STUN only) |
| Port | 5300 (HTTP), 7300 (HTTPS) |

---

## Firebase Project

- **Project ID:** livechatapp-b5399
- **Console:** https://console.firebase.google.com/project/livechatapp-b5399
- **Admin UID (hardcoded):** SZvYG7wbQ9TzgWySvLwVU240reD3
- **Admin email:** shiva2gamedev@gmail.com

---

## Git Branches

| Branch | Status | Notes |
|--------|--------|-------|
| `working-backup` | ✅ Stable baseline | Original working version |
| `edit-status-and-blockers-saturday` | ✅ Last fully working | All features working including user login |
| `monday-user-login-crashed` | ⚠️ Current | User login/chat UI broken — see issue below |

**If user login is broken, refer to:** `edit-status-and-blockers-saturday`  
That branch has the last confirmed working state of index.html (user chat page).

---

## ⚠️ Known Issue — User Login / Chat Page Broken

**Branch:** `monday-user-login-crashed`  
**Problem:** The user chat page (`index.html`) was rewritten multiple times during a UI redesign attempt. The file got corrupted and then restored from git, but the current `index.html` may not match what the server is serving due to browser cache and file lock issues on Windows.

**Symptom:** After user logs in, the chat page either shows blank, shows old purple UI, or shows incorrect layout.

**Fix approach:**
1. Checkout `edit-status-and-blockers-saturday` branch
2. Copy `wwwroot/index.html` from that branch
3. Apply only CSS color changes (do NOT change HTML structure or JS)
4. The correct working index.html uses the old purple glassmorphism theme

**Root cause:** On Windows, `dotnet run` locks static files. Any file write while the server is running silently fails or partially writes. Always stop the server before editing static files.

---

## Features Completed

- [x] Real-time chat via SignalR (project-based room isolation)
- [x] Message history from Firestore (grouped by date)
- [x] Image sharing (compressed, stored in Firestore)
- [x] Typing indicators
- [x] Voice calls (WebRTC)
- [x] Video calls (WebRTC) — in ChatHub.cs and chat.js
- [x] Screen share — in chat.js
- [x] Status Update tab (per project, date grouped)
- [x] Blockers tab (per project, date grouped)
- [x] Admin Inbox — admin sends direct messages to users
- [x] User Inbox tab — users reply to admin messages
- [x] Collapsible sidebar (online users)
- [x] Roles: Member (full access) / Viewer (read only)
- [x] Multi-project assignment per user
- [x] Admin panel: Projects tab + Users tab
- [x] Edit projects (name, description)
- [x] Edit users (name, role, projects)
- [x] Bulk user upload via Excel (.xlsx) with preview
- [x] Download Excel template from admin panel
- [x] Password visibility toggle on login pages
- [x] Project picker on login (for users in multiple projects)
- [x] Home page (enterprise landing page)

---

## Features Pending (from original feedback list)

- [ ] DB Schema documentation
- [ ] Enterprise grade UI — attempted but caused index.html crash. Needs careful CSS-only approach.
- [ ] Bulk upload via Excel — **done** in admin.html but needs testing
- [ ] TURN servers for cross-network WebRTC calls
- [ ] Message pagination (currently loads all history)
- [ ] No message edit/delete

---

## File Structure

```
LiveChatApp-/
  hubs/
    ChatHub.cs          — SignalR hub (voice + video call signaling, messaging)
  wwwroot/
    home.html           — Landing page
    login.html          — User login (Firebase auth + project picker)
    admin.html          — Admin dashboard (projects, users, bulk upload, direct chat)
    index.html          — ⚠️ BROKEN — User chat page (tabs: Chat, Status, Blockers, Inbox)
    chat.js             — SignalR client + WebRTC (voice + video + screen share) + Firestore
    signup.html         — Redirects to login (disabled)
  Program.cs            — App entry, SignalR config, static files
  LiveChatApp.csproj    — .NET 8 target
  Dockerfile            — Multi-stage build, port 10000 for production
```

---

## Firestore Data Structure

```
/projects/{autoId}          — name, desc, created, status
/users/{firebaseUID}        — name, email, role, projectId, projectName, projects[]
/messages/{projectId}/chats — user, type, text, imageData, fileName, timestamp
/statusUpdates/{projectId}/entries — user, text, timestamp
/blockers/{projectId}/entries      — user, text, timestamp
/adminMessages/{userId}/chats      — text, from, timestamp
```

---

## How to Fix User Login (index.html)

1. Stop the server (`Ctrl+C`)
2. Run: `git show edit-status-and-blockers-saturday:wwwroot/index.html > wwwroot/index.html`
3. Run: `dotnet run`
4. Test login at http://localhost:5300

This restores the last known working chat page without touching any other files.

---

## Important Notes for Next Developer

1. **Always stop `dotnet run` before editing any file in `wwwroot/`** — Windows locks files while the server runs
2. **Never use `strReplace` on large HTML files** — use `fsWrite` + `fsAppend` for complete rewrites
3. **Admin UID is hardcoded** in admin.html — `SZvYG7wbQ9TzgWySvLwVU240reD3`
4. **Firebase API keys are public** in all HTML files — this is normal for client-side Firebase
5. **WebRTC only works on HTTPS or localhost** — for production deployment, HTTPS is required
6. **No TURN servers** — cross-network video calls may fail on different ISPs
7. **Images stored as base64 in Firestore** — ~150KB limit per image after compression
