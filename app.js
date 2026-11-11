// ============================================================
//  🔥 FIREBASE CONFIG — এখানে তোর config বসা
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, query, orderBy, onSnapshot,
  serverTimestamp, doc, setDoc, onSnapshot as onSnapDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDZLzKuhjLeaLPD3QoVpia9XPNyvBg_r_o",
  authDomain: "aonneat.firebaseapp.com",
  databaseURL: "https://aonneat-default-rtdb.firebaseio.com",
  projectId: "aonneat",
  storageBucket: "aonneat.firebasestorage.app",
  messagingSenderId: "1030654887677",
  appId: "1:1030654887677:web:3540c94e6469e01f37a094",
  measurementId: "G-XGTL9X9N42"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ============================================================
//  🔑 KEY → USER MAPPING
// ============================================================
const USERS = {
  "27626": { name: "Arman",  other: "Nishi" },
  "64744": { name: "Nishi",  other: "Arman" }
};
const ROOM_ID = "arman_nishi_room";       // একটাই fixed room
const TYPING_TIMEOUT = 2500;              // 2.5s idle → typing off

// ============================================================
//  DOM
// ============================================================
const $ = (id) => document.getElementById(id);
const startScreen = $("startScreen");
const startBtn    = $("startBtn");
const keyModal    = $("keyModal");
const setupForm   = $("setupForm");
const keyInput    = $("key");
const keyError    = $("keyError");
const cancelBtn   = $("cancelBtn");
const chatArea    = $("chatArea");
const chatWith    = $("chatWith");
const statusText  = $("statusText");
const messagesEl  = $("messages");
const chatForm    = $("chatForm");
const msgInput    = $("msgInput");
const logoutBtn   = $("logoutBtn");

// ============================================================
//  STATE
// ============================================================
let currentUser = null;       // "Arman" | "Nishi"
let otherUser   = null;
let unsubMessages = null;
let unsubTyping   = null;
let typingTimer   = null;
let lastTypingSent = 0;
let isSending = false;

// ============================================================
//  START FLOW
// ============================================================
startBtn.addEventListener("click", () => {
  keyModal.classList.add("show");
  keyError.textContent = "";
  keyInput.value = "";
  setTimeout(() => keyInput.focus(), 250);
});

cancelBtn.addEventListener("click", () => {
  keyModal.classList.remove("show");
});

setupForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const key = keyInput.value.trim();
  const user = USERS[key];
  if (!user) {
    keyError.textContent = "Invalid key. Try again.";
    keyInput.value = "";
    keyInput.focus();
    return;
  }
  // save login
  localStorage.setItem("chat_key", key);
  enterChat(key);
});

// auto-login on reload
window.addEventListener("DOMContentLoaded", () => {
  const saved = localStorage.getItem("chat_key");
  if (saved && USERS[saved]) {
    enterChat(saved);
  }
});

// ============================================================
//  ENTER CHAT
// ============================================================
async function enterChat(key) {
  const user = USERS[key];
  currentUser = user.name;
  otherUser   = user.other;

  // UI switch
  keyModal.classList.remove("show");
  startScreen.classList.add("hidden");
  chatArea.classList.remove("hidden");
  chatWith.textContent = otherUser;
  statusText.textContent = "Online";
  statusText.classList.remove("typing");
  messagesEl.innerHTML = "";

  // mark self online
  await setDoc(doc(db, "rooms", ROOM_ID, "presence", currentUser), {
    online: true,
    updatedAt: serverTimestamp()
  });

  listenMessages();
  listenTyping();
  listenPresence();
}

// ============================================================
//  MESSAGES
// ============================================================
function listenMessages() {
  if (unsubMessages) unsubMessages();
  const q = query(
    collection(db, "rooms", ROOM_ID, "messages"),
    orderBy("createdAt", "asc")
  );
  unsubMessages = onSnapshot(q, (snap) => {
    messagesEl.innerHTML = "";
    if (snap.empty) {
      const hint = document.createElement("div");
      hint.className = "empty-hint";
      hint.textContent = "No messages yet. Say hi 👋";
      messagesEl.appendChild(hint);
      return;
    }
    snap.forEach((d) => {
      const m = d.data();
      renderMessage(m);
    });
    scrollToBottom();
  });
}

function renderMessage(m) {
  const div = document.createElement("div");
  div.className = "msg " + (m.sender === currentUser ? "me" : "them");
  const text = document.createElement("span");
  text.textContent = m.text;
  const time = document.createElement("span");
  time.className = "time";
  time.textContent = formatTime(m.createdAt);
  div.appendChild(text);
  div.appendChild(time);
  messagesEl.appendChild(div);
}

function formatTime(ts) {
  if (!ts) return "";
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}

// send
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = msgInput.value.trim();
  if (!text || isSending) return;
  isSending = true;
  msgInput.value = "";
  try {
    await addDoc(collection(db, "rooms", ROOM_ID, "messages"), {
      text,
      sender: currentUser,
      createdAt: serverTimestamp()
    });
    await clearTyping();  // typing off after send
  } catch (err) {
    console.error("send error:", err);
    // revert on error
    msgInput.value = text;
  } finally {
    isSending = false;
  }
});

// ============================================================
//  TYPING INDICATOR
// ============================================================
function listenTyping() {
  if (unsubTyping) unsubTyping();
  const ref = doc(db, "rooms", ROOM_ID, "typing", otherUser);
  unsubTyping = onSnapshot(ref, (snap) => {
    const data = snap.data();
    if (data && data.isTyping && data.updatedAt) {
      const updated = data.updatedAt.toDate
        ? data.updatedAt.toDate().getTime()
        : new Date(data.updatedAt).getTime();
      if (Date.now() - updated < 4000) {
        statusText.textContent = "typing...";
        statusText.classList.add("typing");
        return;
      }
    }
    setOnlineStatus();
  });
}

async function setTyping() {
  const now = Date.now();
  if (now - lastTypingSent < 800) return;   // throttle
  lastTypingSent = now;
  try {
    await setDoc(doc(db, "rooms", ROOM_ID, "typing", currentUser), {
      isTyping: true,
      updatedAt: serverTimestamp()
    });
  } catch (e) { /* silent */ }
}

async function clearTyping() {
  try {
    await setDoc(doc(db, "rooms", ROOM_ID, "typing", currentUser), {
      isTyping: false,
      updatedAt: serverTimestamp()
    });
  } catch (e) { /* silent */ }
}

msgInput.addEventListener("input", () => {
  setTyping();
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    clearTyping();
  }, TYPING_TIMEOUT);
});

// ============================================================
//  PRESENCE (online status)
// ============================================================
let unsubPresence = null;
function listenPresence() {
  if (unsubPresence) unsubPresence();
  const ref = doc(db, "rooms", ROOM_ID, "presence", otherUser);
  unsubPresence = onSnapshot(ref, (snap) => {
    const d = snap.data();
    const online = d && d.online;
    if (!statusText.classList.contains("typing")) {
      statusText.textContent = online ? "Online" : "Offline";
    }
  });
}

function setOnlineStatus() {
  // re-check presence doc quickly (fallback)
  const ref = doc(db, "rooms", ROOM_ID, "presence", otherUser);
  onSnapDoc(ref, (snap) => {
    const d = snap.data();
    if (!statusText.classList.contains("typing")) {
      statusText.textContent = d && d.online ? "Online" : "Offline";
    }
  }, { includeMetadataChanges: false });
}

// on unload → offline
window.addEventListener("beforeunload", () => {
  if (!currentUser) return;
  try {
    setDoc(doc(db, "rooms", ROOM_ID, "presence", currentUser), {
      online: false,
      updatedAt: serverTimestamp()
    });
    clearTyping();
  } catch (e) {}
});

// ============================================================
//  LOGOUT
// ============================================================
logoutBtn.addEventListener("click", async () => {
  if (!currentUser) return;
  try {
    await setDoc(doc(db, "rooms", ROOM_ID, "presence", currentUser), {
      online: false,
      updatedAt: serverTimestamp()
    });
    await clearTyping();
  } catch (e) {}
  localStorage.removeItem("chat_key");
  if (unsubMessages) unsubMessages();
  if (unsubTyping) unsubTyping();
  if (unsubPresence) unsubPresence();
  currentUser = null; otherUser = null;
  chatArea.classList.add("hidden");
  startScreen.classList.remove("hidden");
  keyModal.classList.remove("show");
  messagesEl.innerHTML = "";
});