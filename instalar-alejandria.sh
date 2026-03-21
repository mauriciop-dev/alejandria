#!/bin/bash
# ─────────────────────────────────────────────
# AlejandrIA — Setup completo en tu máquina
# Corre con: bash instalar-alejandria.sh
# ─────────────────────────────────────────────
set -e

echo "✦ Creando proyecto AlejandrIA..."
mkdir -p alejandria/extension/icons
mkdir -p alejandria/backend/api
cd alejandria

# ── .gitignore ──
cat > .gitignore << 'GITIGNORE'
.env
*.env.local
node_modules/
.DS_Store
Thumbs.db
*.log
.vercel/
GITIGNORE

# ── .env.example ──
cat > .env.example << 'ENVFILE'
GEMINI_API_KEY=tu_api_key_de_gemini_aqui
PORT=3000
ENVFILE

# ── package.json ──
cat > package.json << 'PKG'
{
  "name": "alejandria",
  "version": "0.1.0",
  "description": "AlejandrIA — compañera de aprendizaje con IA para Chrome",
  "type": "module",
  "scripts": {
    "dev": "node server.js",
    "start": "node server.js"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2"
  }
}
PKG

# ── server.js ──
cat > server.js << 'SERVER'
import express from "express";
import cors from "cors";
import { config } from "dotenv";
config();
const app = express();
app.use(cors());
app.use(express.json());
const { default: handler } = await import("./backend/api/chat.js");
app.post("/api/chat", (req, res) => handler(req, res));
app.get("/", (req, res) => res.send("AlejandrIA backend corriendo ✓"));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✦ AlejandrIA backend en http://localhost:${PORT}`);
  console.log(`  Gemini API key: ${process.env.GEMINI_API_KEY ? "✓ configurada" : "✗ FALTA en .env"}\n`);
});
SERVER

# ── backend/api/chat.js ──
cat > backend/api/chat.js << 'CHAT'
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { messages, systemExtra, userName, hasPlan, planTopic } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: "messages requerido" });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key no configurada" });
  const systemPrompt = buildSystemPrompt(userName, hasPlan, planTopic, systemExtra);
  const geminiMessages = messages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }]
  }));
  if (systemExtra && geminiMessages.length > 0) {
    const last = geminiMessages[geminiMessages.length - 1];
    if (last.role === "user") last.parts[0].text += systemExtra;
  }
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: geminiMessages,
          generationConfig: { temperature: 0.8, maxOutputTokens: 512, topP: 0.9 }
        })
      }
    );
    if (!response.ok) { const e = await response.text(); return res.status(502).json({ error: "Error de Gemini", detail: e }); }
    const data = await response.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "No pude generar una respuesta.";
    return res.status(200).json({ reply });
  } catch (err) {
    return res.status(500).json({ error: "Error interno", detail: err.message });
  }
}
function buildSystemPrompt(userName, hasPlan, planTopic) {
  const name = userName || "el usuario";
  return `Eres AlejandrIA, una compañera de aprendizaje con IA integrada en el navegador de ${name}.
PERSONALIDAD:
- Eres directa, cálida y ligeramente irreverente. No eres condescendiente.
- Tienes criterio propio: si ${name} se desvía del plan, lo señalas con amabilidad pero firmeza.
- Hablas en español colombiano. Eres concisa: máximo 3-4 oraciones por respuesta.
CONTEXTO ACTUAL:
${hasPlan ? `- ${name} tiene un plan activo sobre: "${planTopic}". Recuérdale el progreso cuando sea relevante.` : `- ${name} aún no tiene un plan. Si menciona querer aprender algo, propón crear uno.`}
CUANDO GENERES UN PLAN:
- Escribe "PLAN:" al inicio. Lista pasos numerados, máximo 5, concretos y alcanzables.
CUANDO ANALICES UNA PÁGINA:
- Resume en 2 frases. Pregunta si quiere aprender algo específico.`;
}
CHAT

# ── extension/manifest.json ──
cat > extension/manifest.json << 'MANIFEST'
{
  "manifest_version": 3,
  "name": "AlejandrIA",
  "version": "0.1.0",
  "description": "Tu compañera de aprendizaje con IA",
  "permissions": ["activeTab", "scripting", "storage", "sidePanel", "tabs"],
  "host_permissions": ["<all_urls>"],
  "background": { "service_worker": "background.js" },
  "content_scripts": [{ "matches": ["<all_urls>"], "js": ["content.js"], "run_at": "document_idle" }],
  "side_panel": { "default_path": "sidepanel.html" },
  "action": { "default_title": "Abrir AlejandrIA", "default_icon": { "16": "icons/icon16.png", "48": "icons/icon48.png", "128": "icons/icon128.png" } },
  "icons": { "16": "icons/icon16.png", "48": "icons/icon48.png", "128": "icons/icon128.png" }
}
MANIFEST

# ── extension/background.js ──
cat > extension/background.js << 'BG'
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_PAGE_CONTEXT") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) return sendResponse({ error: "No hay pestaña activa" });
      chrome.tabs.sendMessage(tabs[0].id, { type: "READ_PAGE" }, (response) => {
        if (chrome.runtime.lastError) {
          chrome.scripting.executeScript({ target: { tabId: tabs[0].id }, files: ["content.js"] }, () => {
            setTimeout(() => chrome.tabs.sendMessage(tabs[0].id, { type: "READ_PAGE" }, sendResponse), 300);
          });
        } else { sendResponse(response); }
      });
    });
    return true;
  }
  if (message.type === "GET_ACTIVE_TAB_URL") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      sendResponse({ url: tabs[0]?.url || "", title: tabs[0]?.title || "" });
    });
    return true;
  }
});
BG

# ── extension/content.js ──
cat > extension/content.js << 'CONTENT'
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "READ_PAGE") { sendResponse(extractPageContext()); }
  return true;
});
function extractPageContext() {
  const title = document.title || "";
  const url = window.location.href;
  const metaDesc = document.querySelector('meta[name="description"]')?.content || "";
  const headings = Array.from(document.querySelectorAll("h1, h2")).slice(0, 8).map(h => h.innerText.trim()).filter(t => t.length > 0);
  const paragraphs = Array.from(document.querySelectorAll("p, article, main")).map(el => el.innerText.trim()).filter(t => t.length > 80).slice(0, 5).join(" ").substring(0, 1500);
  const hasVideo = !!(document.querySelector("video, iframe[src*='youtube'], iframe[src*='vimeo']"));
  const platform = detectPlatform(url);
  return { title, url, metaDesc, headings, paragraphs, hasVideo, platform, timestamp: Date.now() };
}
function detectPlatform(url) {
  const platforms = { "youtube.com": "YouTube", "udemy.com": "Udemy", "coursera.org": "Coursera", "platzi.com": "Platzi", "notion.so": "Notion", "github.com": "GitHub", "stackoverflow.com": "Stack Overflow", "medium.com": "Medium", "figma.com": "Figma" };
  for (const [domain, name] of Object.entries(platforms)) { if (url.includes(domain)) return name; }
  return "web";
}
CONTENT

# ── extension/sidepanel.html ──
cat > extension/sidepanel.html << 'HTML'
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AlejandrIA</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
<div id="app">
  <div id="header">
    <div id="avatar">✦</div>
    <div id="header-info">
      <div id="agent-name">AlejandrIA</div>
      <div id="status-line">Lista para aprender contigo</div>
    </div>
  </div>
  <div id="page-context-bar">
    <img id="page-favicon" src="" alt="">
    <span id="page-title-text">Leyendo página...</span>
  </div>
  <div id="messages"></div>
  <div id="input-area">
    <div id="text-input-row">
      <textarea id="user-input" placeholder="Escríbeme o usa el micrófono..." rows="1"></textarea>
      <button class="icon-btn" id="mic-btn" title="Hablar">🎙</button>
      <button class="icon-btn" id="send-btn" title="Enviar">↑</button>
    </div>
    <div id="action-row">
      <button class="quick-btn" id="btn-analyze">¿Qué es esta página?</button>
      <button class="quick-btn" id="btn-learn">Quiero aprender algo</button>
      <button class="quick-btn" id="btn-plan">Ver mi plan</button>
    </div>
  </div>
</div>
<script src="sidepanel.js"></script>
</body>
</html>
HTML

# ── extension/sidepanel.js ──
cat > extension/sidepanel.js << 'SIDEPANEL'
const BACKEND_URL = "https://imshzesyygjqkqfatrmr.supabase.co/functions/v1/chat";
let conversationHistory = [], currentPlan = null, pageContext = null, userName = "", isRecording = false, recognition = null;
const messagesEl = document.getElementById("messages");
const userInputEl = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const micBtn = document.getElementById("mic-btn");
const statusLine = document.getElementById("status-line");
const avatarEl = document.getElementById("avatar");
const pageTitleEl = document.getElementById("page-title-text");
const pageFaviconEl = document.getElementById("page-favicon");

async function init() {
  await loadUserProfile();
  await loadPageContext();
  setupSpeechRecognition();
  setupEventListeners();
  await sendToAgent(buildGreeting(), { isSystemTrigger: true });
}
async function loadUserProfile() {
  return new Promise(resolve => {
    chrome.storage.local.get(["userName", "conversationHistory", "currentPlan"], (data) => {
      userName = data.userName || ""; conversationHistory = data.conversationHistory || []; currentPlan = data.currentPlan || null; resolve();
    });
  });
}
async function loadPageContext() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type: "GET_ACTIVE_TAB_URL" }, (tabInfo) => {
      if (tabInfo) {
        pageTitleEl.textContent = tabInfo.title || tabInfo.url || "Nueva pestaña";
        if (tabInfo.url) { try { pageFaviconEl.src = `https://www.google.com/s2/favicons?domain=${new URL(tabInfo.url).hostname}&sz=16`; } catch {} }
      }
      resolve();
    });
    chrome.runtime.sendMessage({ type: "GET_PAGE_CONTEXT" }, (context) => { pageContext = context; });
  });
}
function buildGreeting() {
  const hour = new Date().getHours();
  const t = hour < 12 ? "Buenos días" : hour < 18 ? "Buenas tardes" : "Buenas noches";
  const n = userName ? `, ${userName}` : "";
  const p = currentPlan ? `Tengo tu plan de "${currentPlan.topic}" guardado. ¿Continuamos?` : "¿En qué quieres enfocarte hoy?";
  return `${t}${n}. ${p}`;
}
function setupEventListeners() {
  sendBtn.addEventListener("click", handleSend);
  micBtn.addEventListener("click", toggleMic);
  document.getElementById("btn-analyze").addEventListener("click", analyzeCurrentPage);
  document.getElementById("btn-learn").addEventListener("click", startLearningFlow);
  document.getElementById("btn-plan").addEventListener("click", showCurrentPlan);
  userInputEl.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } });
  userInputEl.addEventListener("input", () => { userInputEl.style.height = "auto"; userInputEl.style.height = Math.min(userInputEl.scrollHeight, 100) + "px"; });
}
async function handleSend() { const text = userInputEl.value.trim(); if (!text) return; userInputEl.value = ""; userInputEl.style.height = "auto"; await sendToAgent(text); }
async function analyzeCurrentPage() {
  chrome.runtime.sendMessage({ type: "GET_PAGE_CONTEXT" }, async (context) => {
    pageContext = context;
    if (!context || context.error) { addMessage("agent", "No pude leer esta página. Prueba en cualquier sitio web."); return; }
    await sendToAgent(`Analiza esta página: "${context.title}" (${context.url}). Dime de qué se trata en 2-3 frases y pregúntame si quiero aprender algo.`, { isSystemTrigger: true, context });
  });
}
async function startLearningFlow() { await sendToAgent(userName ? "Quiero aprender algo nuevo. Hazme el test inicial." : "Quiero aprender algo. Primero pregúntame mi nombre.", { isSystemTrigger: true }); }
async function showCurrentPlan() { if (!currentPlan) { addMessage("agent", "Todavía no tienes un plan activo. ¿Qué quieres aprender?"); return; } renderPlanCard(currentPlan); }
async function sendToAgent(userMessage, options = {}) {
  const { isSystemTrigger = false, context = pageContext } = options;
  if (!isSystemTrigger) {
    addMessage("user", userMessage);
    if (conversationHistory.length < 4 && userMessage.length < 30) { const n = extractName(userMessage); if (n) { userName = n; chrome.storage.local.set({ userName }); } }
  }
  const typingId = showTyping();
  const pageInfo = context ? `\n\n[Página: "${context.title}" | ${context.url} | ${context.platform}${context.hasVideo ? " | video" : ""}]` : "";
  if (!isSystemTrigger) conversationHistory.push({ role: "user", content: userMessage });
  try {
    const response = await fetch(BACKEND_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: isSystemTrigger ? [{ role: "user", content: userMessage + pageInfo }] : conversationHistory.slice(-10), systemExtra: pageInfo, userName, hasPlan: !!currentPlan, planTopic: currentPlan?.topic || null })
    });
    removeTyping(typingId);
    if (!response.ok) throw new Error(`Backend error: ${response.status}`);
    const data = await response.json();
    const agentReply = data.reply;
    addMessage("agent", agentReply);
    conversationHistory.push({ role: "assistant", content: agentReply });
    if (conversationHistory.length > 30) conversationHistory = conversationHistory.slice(-30);
    chrome.storage.local.set({ conversationHistory });
    const detectedPlan = extractPlanFromResponse(agentReply);
    if (detectedPlan) { currentPlan = detectedPlan; chrome.storage.local.set({ currentPlan }); renderPlanCard(detectedPlan); }
    speak(agentReply);
  } catch (err) {
    removeTyping(typingId);
    addMessage("agent", "Tuve un problema conectándome. Verifica que la GEMINI_API_KEY esté configurada en Supabase.");
    console.error("AlejandrIA error:", err);
  }
}
function addMessage(role, text) {
  const div = document.createElement("div"); div.className = `message ${role}`;
  div.innerHTML = role === "agent" ? `<div class="sender">AlejandrIA</div>${escapeHtml(text)}` : escapeHtml(text);
  messagesEl.appendChild(div); messagesEl.scrollTop = messagesEl.scrollHeight; return div;
}
function showTyping() {
  const id = "t" + Date.now(); const div = document.createElement("div"); div.className = "message agent"; div.id = id;
  div.innerHTML = `<div class="typing-indicator"><span></span><span></span><span></span></div>`; messagesEl.appendChild(div); messagesEl.scrollTop = messagesEl.scrollHeight; return id;
}
function removeTyping(id) { document.getElementById(id)?.remove(); }
function renderPlanCard(plan) {
  const div = document.createElement("div"); div.className = "message agent";
  const stepsHtml = plan.steps.map((s, i) => `<div class="plan-step"><div class="step-num ${s.done ? "done" : ""}">${s.done ? "✓" : i+1}</div><span>${escapeHtml(s.text)}</span></div>`).join("");
  div.innerHTML = `<div class="sender">AlejandrIA</div><div class="plan-card"><div class="plan-title">Plan: ${escapeHtml(plan.topic)}</div>${stepsHtml}</div>`;
  messagesEl.appendChild(div); messagesEl.scrollTop = messagesEl.scrollHeight;
}
function setStatus(text, active = false) { statusLine.textContent = text; statusLine.className = active ? "active" : ""; }
function escapeHtml(text) { return text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>"); }
function setupSpeechRecognition() {
  if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) { micBtn.style.opacity = "0.3"; return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition; recognition = new SR();
  recognition.lang = "es-CO"; recognition.continuous = false; recognition.interimResults = false;
  recognition.onresult = e => { const t = e.results[0][0].transcript; userInputEl.value = t; stopRecording(); sendToAgent(t); };
  recognition.onerror = stopRecording; recognition.onend = stopRecording;
}
function toggleMic() { isRecording ? stopRecording() : startRecording(); }
function startRecording() { if (!recognition) return; isRecording = true; micBtn.classList.add("recording"); setStatus("Escuchando...", true); recognition.start(); }
function stopRecording() { isRecording = false; micBtn.classList.remove("recording"); setStatus("Lista para aprender contigo"); try { recognition?.stop(); } catch {} }
function speak(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const clean = text.replace(/\*\*(.*?)\*\*/g,"$1").replace(/\*(.*?)\*/g,"$1").replace(/#{1,3} /g,"").replace(/<br>/g," ").substring(0,400);
  const u = new SpeechSynthesisUtterance(clean); u.lang = "es-CO"; u.rate = 1.05;
  const voices = window.speechSynthesis.getVoices();
  const v = voices.find(v => v.lang.startsWith("es") && (v.name.includes("Google") || v.name.includes("Microsoft"))) || voices.find(v => v.lang.startsWith("es"));
  if (v) u.voice = v;
  u.onstart = () => { avatarEl.classList.add("speaking"); setStatus("Hablando...", true); };
  u.onend = () => { avatarEl.classList.remove("speaking"); setStatus("Lista para aprender contigo"); };
  window.speechSynthesis.speak(u);
}
function extractName(text) {
  const patterns = [/(?:soy|me llamo|mi nombre es)\s+([A-ZÁÉÍÓÚ][a-záéíóú]+)/i, /^([A-ZÁÉÍÓÚ][a-záéíóú]{2,15})$/];
  for (const p of patterns) { const m = text.match(p); if (m) return m[1]; } return null;
}
function extractPlanFromResponse(text) {
  if (!text.includes("PLAN:") && !text.includes("plan de aprendizaje")) return null;
  const steps = text.split("\n").filter(l => /^\d+[\.\)]\s/.test(l.trim())).map(l => ({ text: l.replace(/^\d+[\.\)]\s/,"").trim(), done: false }));
  if (steps.length < 2) return null;
  const m = text.match(/(?:aprender|plan para|plan de aprendizaje de)\s+"?([^"\n.]+)"?/i);
  return { topic: m ? m[1].trim() : "Tu aprendizaje", steps, createdAt: Date.now() };
}
if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = () => {};
init();
SIDEPANEL

# ── extension/styles.css ──
cat > extension/styles.css << 'CSS'
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display:ital@0;1&display=swap');
:root{--bg:#0d0f14;--bg2:#151820;--bg3:#1e2230;--accent:#7c6af7;--accent2:#a594ff;--text:#e8e6f0;--text2:#9491a8;--text3:#5c5a70;--success:#4ecb8d;--radius:12px;--radius-sm:8px}
*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;overflow:hidden}
body{font-family:'DM Sans',sans-serif;background:var(--bg);color:var(--text);font-size:14px;line-height:1.6}
#app{display:flex;flex-direction:column;height:100vh}
#header{padding:16px 16px 12px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:10px}
#avatar{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--accent),#c084fc);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;position:relative}
#avatar.speaking::after{content:'';position:absolute;inset:-3px;border-radius:50%;border:2px solid var(--accent);animation:pulse-ring 1.2s ease-out infinite}
@keyframes pulse-ring{0%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.4)}}
#agent-name{font-family:'DM Serif Display',serif;font-size:16px;font-weight:400;color:var(--text)}
#status-line{font-size:11px;color:var(--text3);margin-top:1px}#status-line.active{color:var(--success)}
#page-context-bar{margin:10px 12px 0;background:var(--bg3);border-radius:var(--radius-sm);padding:8px 12px;display:flex;align-items:center;gap:8px;border:1px solid rgba(255,255,255,0.05)}
#page-favicon{width:14px;height:14px;border-radius:3px}#page-title-text{font-size:12px;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}
#messages{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px;scrollbar-width:thin;scrollbar-color:var(--bg3) transparent}
.message{max-width:92%;padding:10px 14px;border-radius:var(--radius);font-size:13.5px;animation:msg-in 0.2s ease}
@keyframes msg-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.message.agent{background:var(--bg2);border:1px solid rgba(255,255,255,0.06);border-bottom-left-radius:4px;align-self:flex-start}
.message.agent .sender{font-size:11px;color:var(--accent2);font-weight:500;margin-bottom:4px;font-family:'DM Serif Display',serif;font-style:italic}
.message.user{background:var(--accent);border-bottom-right-radius:4px;align-self:flex-end;color:#fff}
.typing-indicator{display:flex;gap:4px;align-items:center;padding:4px 0}
.typing-indicator span{width:6px;height:6px;border-radius:50%;background:var(--text3);animation:bounce 1.2s ease infinite}
.typing-indicator span:nth-child(2){animation-delay:.2s}.typing-indicator span:nth-child(3){animation-delay:.4s}
@keyframes bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}
.plan-card{background:var(--bg3);border:1px solid rgba(124,106,247,0.3);border-radius:var(--radius);padding:12px;margin-top:6px}
.plan-card .plan-title{font-size:12px;color:var(--accent2);font-weight:500;margin-bottom:8px;text-transform:uppercase;letter-spacing:.06em}
.plan-step{display:flex;align-items:flex-start;gap:8px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:13px;color:var(--text2)}
.plan-step:last-child{border-bottom:none}.step-num{width:18px;height:18px;border-radius:50%;background:rgba(124,106,247,0.2);color:var(--accent2);font-size:10px;font-weight:600;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px}
.step-num.done{background:rgba(78,203,141,0.2);color:var(--success)}
#input-area{padding:10px 12px 14px;border-top:1px solid rgba(255,255,255,0.06);display:flex;flex-direction:column;gap:8px}
#text-input-row{display:flex;align-items:flex-end;gap:8px}
#user-input{flex:1;background:var(--bg2);border:1px solid rgba(255,255,255,0.08);border-radius:var(--radius-sm);color:var(--text);font-family:'DM Sans',sans-serif;font-size:13.5px;padding:10px 12px;resize:none;min-height:42px;max-height:100px;outline:none;transition:border-color .2s}
#user-input:focus{border-color:rgba(124,106,247,0.5)}#user-input::placeholder{color:var(--text3)}
.icon-btn{width:38px;height:38px;border-radius:var(--radius-sm);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;flex-shrink:0;font-size:16px}
#send-btn{background:var(--accent);color:#fff}#send-btn:hover{background:var(--accent2)}#send-btn:disabled{opacity:.4;cursor:not-allowed}
#mic-btn{background:var(--bg3);color:var(--text2);border:1px solid rgba(255,255,255,0.07)}
#mic-btn.recording{background:rgba(240,80,80,0.15);color:#f05050;border-color:rgba(240,80,80,0.4);animation:mic-pulse 1s ease infinite}
@keyframes mic-pulse{0%,100%{box-shadow:0 0 0 0 rgba(240,80,80,0.3)}50%{box-shadow:0 0 0 6px rgba(240,80,80,0)}}
#action-row{display:flex;gap:6px}
.quick-btn{flex:1;padding:6px 8px;background:var(--bg3);border:1px solid rgba(255,255,255,0.06);border-radius:var(--radius-sm);color:var(--text2);font-family:'DM Sans',sans-serif;font-size:11.5px;cursor:pointer;transition:all .15s;text-align:center}
.quick-btn:hover{background:var(--bg2);color:var(--text);border-color:rgba(124,106,247,0.3)}
CSS

# ── Genera íconos simples con Python ──
python3 -c "
import struct, zlib
def make_png(size, r=124, g=106, b=247):
    def chunk(name, data):
        c = zlib.crc32(name + data) & 0xffffffff
        return struct.pack('>I', len(data)) + name + data + struct.pack('>I', c)
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    raw = b''.join(b'\x00' + bytes([r, g, b] * size) for _ in range(size))
    idat = zlib.compress(raw)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b'')
for s in [16, 48, 128]:
    open(f'extension/icons/icon{s}.png', 'wb').write(make_png(s))
    print(f'  icon{s}.png ✓')
"

# ── README ──
cat > README.md << 'README'
# ✦ AlejandrIA

Tu compañera de aprendizaje con IA. Lee las páginas que navegas, habla contigo, y diseña planes de aprendizaje personalizados.

## Setup

1. Agrega tu `GEMINI_API_KEY` en Supabase:
   https://supabase.com/dashboard/project/imshzesyygjqkqfatrmr/settings/functions

2. Carga la extensión en Chrome:
   - chrome://extensions → Modo desarrollador → Cargar sin empaquetar → carpeta `extension/`

3. Navega a cualquier página y abre AlejandrIA desde la barra de Chrome.

## Backend
Edge Function corriendo en Supabase:
https://imshzesyygjqkqfatrmr.supabase.co/functions/v1/chat
README

echo ""
echo "✦ Proyecto creado en: $(pwd)"
echo ""

# ── Git init y push a GitHub ──
git init
git add .
git commit -m "feat: AlejandrIA MVP — extensión Chrome + Supabase backend"
git branch -M main
git remote add origin https://github.com/mauriciop-dev/alejandria.git
echo ""
echo "Listo para hacer push. Corre:"
echo "  git push -u origin main"
echo ""
echo "Cuando te pida contraseña, usa tu token de GitHub (ghp_...)"
