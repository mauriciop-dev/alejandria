// sidepanel.js — AlejandrIA con Groq
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
let GROQ_KEY = "";

let conversationHistory = [], currentPlan = null, pageContext = null;
let userName = "", isRecording = false;

const messagesEl = document.getElementById("messages");
const userInputEl = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const micBtn = document.getElementById("mic-btn");
const statusLine = document.getElementById("status-line");
const avatarEl = document.getElementById("avatar");
const pageTitleEl = document.getElementById("page-title-text");
const pageFaviconEl = document.getElementById("page-favicon");

// ── Conexión persistente con background para recibir STT ──
const bgPort = chrome.runtime.connect({ name: "sidepanel" });
bgPort.onMessage.addListener((message) => {
    if (message.type === "STT_RESULT") {
        userInputEl.value = message.transcript;
        stopRecording();
        sendToAgent(message.transcript);
    }
    if (message.type === "STT_ERROR") {
        stopRecording();
        if (message.error === "not-allowed") {
            addMessage("agent", "No tengo permiso para el micrófono. Haz clic en el candado de la barra de Chrome → Micrófono → Permitir.");
        } else if (message.error === "no-speech") {
            addMessage("agent", "No escuché nada. ¿Intentamos de nuevo?");
        } else if (message.error === "no_support") {
            addMessage("agent", "Tu navegador no soporta reconocimiento de voz.");
        }
    }
    if (message.type === "STT_END") {
        stopRecording();
    }
});

async function init() {
    await loadApiKey();
    await loadUserProfile();
    setupEventListeners();

    if (!GROQ_KEY) {
        showKeySetup();
        return;
    }

    // Inyecta content script e lee contexto de la página al iniciar
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (tabs[0]) {
            pageTitleEl.textContent = tabs[0].title || tabs[0].url || "Nueva pestaña";
            try {
                const domain = new URL(tabs[0].url).hostname;
                pageFaviconEl.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
            } catch { }

            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tabs[0].id },
                    files: ["content.js"]
                });
            } catch (e) { } // ya estaba inyectado

            chrome.runtime.sendMessage({ type: "GET_PAGE_CONTEXT" }, async (context) => {
                pageContext = context || null;
                await sendToAgent(buildGreeting(), { isSystemTrigger: true });
            });
        } else {
            await sendToAgent(buildGreeting(), { isSystemTrigger: true });
        }
    });
}

async function loadApiKey() {
    return new Promise(resolve => {
        chrome.storage.local.get(["groqKey"], (data) => {
            GROQ_KEY = data.groqKey || "";
            resolve();
        });
    });
}

function showKeySetup() {
    messagesEl.innerHTML = `
    <div class="setup-card">
      <div class="setup-title">✦ Configura AlejandrIA</div>
      <div class="setup-desc">
        Necesito tu API key de Groq para funcionar.<br>
        Es gratis en <a href="https://console.groq.com" target="_blank">console.groq.com</a>
      </div>
      <input type="password" id="key-input" placeholder="gsk_..." spellcheck="false"/>
      <button id="key-save-btn">Guardar y continuar →</button>
    </div>
  `;
    const style = document.createElement("style");
    style.textContent = `
    .setup-card { background: var(--bg2); border: 1px solid rgba(124,106,247,0.3); border-radius: 12px; padding: 20px; margin: 12px; display: flex; flex-direction: column; gap: 12px; }
    .setup-title { font-family: 'DM Serif Display', serif; font-size: 18px; color: var(--accent2); }
    .setup-desc { font-size: 13px; color: var(--text2); line-height: 1.6; }
    .setup-desc a { color: var(--accent2); }
    #key-input { background: var(--bg3); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: var(--text); padding: 10px 12px; font-size: 13px; font-family: monospace; outline: none; }
    #key-input:focus { border-color: rgba(124,106,247,0.5); }
    #key-save-btn { background: var(--accent); color: #fff; border: none; border-radius: 8px; padding: 10px; font-size: 14px; cursor: pointer; font-family: 'DM Sans', sans-serif; }
    #key-save-btn:hover { background: var(--accent2); }
  `;
    document.head.appendChild(style);
    document.getElementById("key-save-btn").addEventListener("click", async () => {
        const key = document.getElementById("key-input").value.trim();
        if (!key.startsWith("gsk_")) {
            document.getElementById("key-input").style.borderColor = "rgba(240,80,80,0.6)";
            return;
        }
        GROQ_KEY = key;
        chrome.storage.local.set({ groqKey: key });
        messagesEl.innerHTML = "";
        init();
    });
}

async function loadUserProfile() {
    return new Promise(resolve => {
        chrome.storage.local.get(["userName", "conversationHistory", "currentPlan"], (data) => {
            userName = data.userName || "";
            conversationHistory = data.conversationHistory || [];
            currentPlan = data.currentPlan || null;
            resolve();
        });
    });
}

function buildGreeting() {
    const hour = new Date().getHours();
    const t = hour < 12 ? "Buenos días" : hour < 18 ? "Buenas tardes" : "Buenas noches";
    const n = userName ? `, ${userName}` : "";
    const p = currentPlan
        ? `Tengo tu plan de "${currentPlan.topic}" guardado. ¿Continuamos?`
        : "¿En qué quieres enfocarte hoy?";
    return `${t}${n}. ${p}`;
}

function buildSystemPrompt() {
    const name = userName || "Mauricio";
    return `Eres AlejandrIA, compañera de aprendizaje de ${name}. Eres directa, cálida y ligeramente irreverente. Nunca condescendiente. Hablas en español colombiano natural. Máximo 3-4 oraciones por respuesta. Sin asteriscos ni markdown, solo texto plano.
${currentPlan
            ? `Tienes un plan activo sobre "${currentPlan.topic}". Recuérdale el progreso cuando sea relevante.`
            : "No hay plan activo aún. Si menciona querer aprender algo, propón crear uno."
        }
Cuando generes un plan escribe PLAN: al inicio y lista los pasos numerados (1. 2. 3.) máximo 5, concretos y alcanzables.
Cuando analices una página resume en 2 frases y pregunta si quiere aprender algo específico.
Tu objetivo es que ${name} aprenda de verdad, no solo que se sienta bien.`;
}

function setupEventListeners() {
    sendBtn.addEventListener("click", handleSend);
    micBtn.addEventListener("click", toggleMic);
    document.getElementById("btn-analyze").addEventListener("click", analyzeCurrentPage);
    document.getElementById("btn-learn").addEventListener("click", startLearningFlow);
    document.getElementById("btn-plan").addEventListener("click", showCurrentPlan);
    userInputEl.addEventListener("keydown", e => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
    });
    userInputEl.addEventListener("input", () => {
        userInputEl.style.height = "auto";
        userInputEl.style.height = Math.min(userInputEl.scrollHeight, 100) + "px";
    });
}

async function handleSend() {
    const text = userInputEl.value.trim();
    if (!text) return;
    userInputEl.value = "";
    userInputEl.style.height = "auto";
    await sendToAgent(text);
}

async function analyzeCurrentPage() {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (!tabs[0]) return;
        try {
            await chrome.scripting.executeScript({ target: { tabId: tabs[0].id }, files: ["content.js"] });
        } catch (e) { }
        chrome.runtime.sendMessage({ type: "GET_PAGE_CONTEXT" }, async (context) => {
            pageContext = context;
            if (!context || context.error) {
                addMessage("agent", "No pude leer esta página. Intenta recargarla primero.");
                return;
            }
            await sendToAgent(
                `Analiza esta página: "${context.title}" (${context.url}). Dime de qué se trata en 2-3 frases y pregúntame si quiero aprender algo.`,
                { isSystemTrigger: true, context }
            );
        });
    });
}

async function startLearningFlow() {
    await sendToAgent(
        userName
            ? "Quiero aprender algo nuevo. Hazme el test inicial de habilidades para diseñar un plan."
            : "Quiero aprender algo nuevo. Primero pregúntame mi nombre, luego hazme el test inicial.",
        { isSystemTrigger: true }
    );
}

async function showCurrentPlan() {
    if (!currentPlan) {
        addMessage("agent", "Todavía no tienes un plan activo. ¿Qué quieres aprender?");
        return;
    }
    renderPlanCard(currentPlan);
}

function toggleMic() { isRecording ? stopRecording() : startRecording(); }

function startRecording() {
    isRecording = true;
    micBtn.classList.add("recording");
    setStatus("Escuchando...", true);
    chrome.runtime.sendMessage({ type: "START_RECORDING" });
}

function stopRecording() {
    if (!isRecording) return;
    isRecording = false;
    micBtn.classList.remove("recording");
    setStatus("Lista para aprender contigo");
    chrome.runtime.sendMessage({ type: "STOP_RECORDING" });
}

async function sendToAgent(userMessage, options = {}) {
    const { isSystemTrigger = false, context = pageContext } = options;
    if (!isSystemTrigger) {
        addMessage("user", userMessage);
        if (conversationHistory.length < 4 && userMessage.length < 30) {
            const n = extractName(userMessage);
            if (n) { userName = n; chrome.storage.local.set({ userName }); }
        }
    }
    const typingId = showTyping();
    const pageInfo = context
        ? `\n\n[Página activa: "${context.title}" | ${context.url} | ${context.platform}${context.hasVideo ? " | contiene video" : ""}${context.headings?.length ? " | Temas: " + context.headings.slice(0, 3).join(", ") : ""}${context.paragraphs ? " | Contenido: " + context.paragraphs.substring(0, 500) : ""}]`
        : "";
    if (!isSystemTrigger) conversationHistory.push({ role: "user", content: userMessage });

    const messages = [
        { role: "system", content: buildSystemPrompt() },
        ...(isSystemTrigger
            ? [{ role: "user", content: userMessage + pageInfo }]
            : conversationHistory.slice(-10).map(m => ({
                role: m.role === "assistant" ? "assistant" : "user",
                content: m.content
            }))
        )
    ];

    try {
        const response = await fetch(GROQ_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${GROQ_KEY}`
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages,
                temperature: 0.8,
                max_tokens: 512
            })
        });
        removeTyping(typingId);
        if (!response.ok) { const e = await response.text(); throw new Error(`Groq ${response.status}: ${e}`); }
        const data = await response.json();
        const agentReply = data.choices?.[0]?.message?.content || "Sin respuesta.";
        addMessage("agent", agentReply);
        conversationHistory.push({ role: "assistant", content: agentReply });
        if (conversationHistory.length > 30) conversationHistory = conversationHistory.slice(-30);
        chrome.storage.local.set({ conversationHistory });
        const detectedPlan = extractPlanFromResponse(agentReply);
        if (detectedPlan) { currentPlan = detectedPlan; chrome.storage.local.set({ currentPlan }); renderPlanCard(detectedPlan); }
        speak(agentReply);
    } catch (err) {
        removeTyping(typingId);
        addMessage("agent", "Ups, tuve un problema conectándome.");
        console.error("AlejandrIA error:", err);
    }
}

function addMessage(role, text) {
    const div = document.createElement("div");
    div.className = `message ${role}`;
    div.innerHTML = role === "agent"
        ? `<div class="sender">AlejandrIA</div>${escapeHtml(text)}`
        : escapeHtml(text);
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
}

function showTyping() {
    const id = "t" + Date.now();
    const div = document.createElement("div");
    div.className = "message agent"; div.id = id;
    div.innerHTML = `<div class="typing-indicator"><span></span><span></span><span></span></div>`;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return id;
}

function removeTyping(id) { document.getElementById(id)?.remove(); }

function renderPlanCard(plan) {
    const div = document.createElement("div");
    div.className = "message agent";
    const stepsHtml = plan.steps.map((s, i) =>
        `<div class="plan-step">
      <div class="step-num ${s.done ? "done" : ""}">${s.done ? "✓" : i + 1}</div>
      <span>${escapeHtml(s.text)}</span>
    </div>`
    ).join("");
    div.innerHTML = `<div class="sender">AlejandrIA</div>
    <div class="plan-card">
      <div class="plan-title">Plan: ${escapeHtml(plan.topic)}</div>
      ${stepsHtml}
    </div>`;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setStatus(text, active = false) {
    statusLine.textContent = text;
    statusLine.className = active ? "active" : "";
}

function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
}

function speak(text) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const clean = text.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1")
        .replace(/#{1,3} /g, "").replace(/<br>/g, " ").substring(0, 400);
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = "es-CO"; u.rate = 1.05;
    const voices = window.speechSynthesis.getVoices();
    const v = voices.find(v => v.lang.startsWith("es") && (v.name.includes("Google") || v.name.includes("Microsoft")))
        || voices.find(v => v.lang.startsWith("es"));
    if (v) u.voice = v;
    u.onstart = () => { avatarEl.classList.add("speaking"); setStatus("Hablando...", true); };
    u.onend = () => { avatarEl.classList.remove("speaking"); setStatus("Lista para aprender contigo"); };
    window.speechSynthesis.speak(u);
}

function extractName(text) {
    const patterns = [/(?:soy|me llamo|mi nombre es)\s+([A-ZÁÉÍÓÚ][a-záéíóú]+)/i, /^([A-ZÁÉÍÓÚ][a-záéíóú]{2,15})$/];
    for (const p of patterns) { const m = text.match(p); if (m) return m[1]; }
    return null;
}

function extractPlanFromResponse(text) {
    if (!text.includes("PLAN:") && !text.includes("plan de aprendizaje")) return null;
    const steps = text.split("\n").filter(l => /^\d+[\.\)]\s/.test(l.trim()))
        .map(l => ({ text: l.replace(/^\d+[\.\)]\s/, "").trim(), done: false }));
    if (steps.length < 2) return null;
    const m = text.match(/(?:aprender|plan para|plan de aprendizaje de)\s+"?([^"\n.]+)"?/i);
    return { topic: m ? m[1].trim() : "Tu aprendizaje", steps, createdAt: Date.now() };
}

if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = () => { };
init();