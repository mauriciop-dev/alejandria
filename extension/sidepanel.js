const BACKEND_URL = "https://imshzesyygjqkqfatrmr.supabase.co/functions/v1/chat";

let conversationHistory = [], currentPlan = null, pageContext = null;
let userName = "", isRecording = false, recognition = null;

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
            userName = data.userName || "";
            conversationHistory = data.conversationHistory || [];
            currentPlan = data.currentPlan || null;
            resolve();
        });
    });
}

async function loadPageContext() {
    return new Promise(resolve => {
        chrome.runtime.sendMessage({ type: "GET_ACTIVE_TAB_URL" }, (tabInfo) => {
            if (tabInfo) {
                pageTitleEl.textContent = tabInfo.title || tabInfo.url || "Nueva pestaña";
                if (tabInfo.url) {
                    try {
                        const domain = new URL(tabInfo.url).hostname;
                        pageFaviconEl.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
                    } catch { }
                }
            }
            resolve();
        });
        chrome.runtime.sendMessage({ type: "GET_PAGE_CONTEXT" }, (context) => {
            pageContext = context;
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
    chrome.runtime.sendMessage({ type: "GET_PAGE_CONTEXT" }, async (context) => {
        pageContext = context;
        if (!context || context.error) {
            addMessage("agent", "No pude leer esta página. Prueba en cualquier sitio web.");
            return;
        }
        await sendToAgent(
            `Analiza esta página: "${context.title}" (${context.url}). Dime de qué se trata en 2-3 frases y pregúntame si quiero aprender algo.`,
            { isSystemTrigger: true, context }
        );
    });
}

async function startLearningFlow() {
    await sendToAgent(
        userName ? "Quiero aprender algo nuevo. Hazme el test inicial de habilidades."
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
        ? `\n\n[Página: "${context.title}" | ${context.url} | ${context.platform}${context.hasVideo ? " | video" : ""}]`
        : "";

    if (!isSystemTrigger) {
        conversationHistory.push({ role: "user", content: userMessage });
    }

    try {
        const response = await fetch(BACKEND_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                messages: isSystemTrigger
                    ? [{ role: "user", content: userMessage + pageInfo }]
                    : conversationHistory.slice(-10),
                systemExtra: pageInfo,
                userName,
                hasPlan: !!currentPlan,
                planTopic: currentPlan?.topic || null
            })
        });

        removeTyping(typingId);
        if (!response.ok) throw new Error(`Backend error: ${response.status}`);

        const data = await response.json();
        const agentReply = data.reply;
        addMessage("agent", agentReply);

        conversationHistory.push({ role: "assistant", content: agentReply });
        chrome.storage.local.set({ conversationHistory });

        if (data.plan) {
            currentPlan = data.plan;
            chrome.storage.local.set({ currentPlan });
            renderPlanCard(currentPlan);
        }
    } catch (err) {
        removeTyping(typingId);
        addMessage("agent", "Ups, tuve un problema de conexión. ¿Podrías intentarlo de nuevo?");
    }
}

function addMessage(role, text) {
    const div = document.createElement("div");
    div.className = `message ${role}`;
    div.innerHTML = marked.parse(text);
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    if (role === "user") {
        conversationHistory.push({ role: "user", content: text });
    } else {
        conversationHistory.push({ role: "assistant", content: text });
    }
    chrome.storage.local.set({ conversationHistory });
}

function showTyping() {
    const id = "typing-" + Date.now();
    const div = document.createElement("div");
    div.className = "message assistant typing";
    div.id = id;
    div.innerHTML = `
    <div class="avatar">✦</div>
    <div class="bubble">
      <div class="typing-dots">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return id;
}

function removeTyping(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function renderPlanCard(plan) {
    const existing = document.getElementById("plan-card");
    if (existing) existing.remove();

    const div = document.createElement("div");
    div.id = "plan-card";
    div.className = "plan-card";
    div.innerHTML = `
    <div class="plan-header">
      <h3>Plan de Aprendizaje: ${plan.topic}</h3>
      <button class="icon-btn" id="close-plan">×</button>
    </div>
    <div class="plan-body">
      <p><strong>Objetivo:</strong> ${plan.goal}</p>
      <p><strong>Nivel:</strong> ${plan.level}</p>
      <p><strong>Duración:</strong> ${plan.duration}</p>
      <p><strong>Habilidades:</strong> ${plan.skills.join(", ")}</p>
      <div class="plan-actions">
        <button class="quick-btn" id="btn-start-plan">Comenzar ahora</button>
        <button class="quick-btn" id="btn-review-plan">Revisar plan</button>
      </div>
    </div>
  `;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    document.getElementById("close-plan").addEventListener("click", () => div.remove());
    document.getElementById("btn-start-plan").addEventListener("click", () => {
        div.remove();
        sendToAgent("Vamos a empezar con el primer módulo del plan.", { isSystemTrigger: true });
    });
    document.getElementById("btn-review-plan").addEventListener("click", () => {
        div.remove();
        sendToAgent("Muéstrame el plan completo y los recursos.", { isSystemTrigger: true });
    });
}

function extractName(text) {
    const match = text.match(/(?:mi nombre es|soy|me llamo)\s+([A-Za-zÁÉÍÓÚáéíóúñÑ]+)/i);
    if (match) return match[1];
    if (text.length < 20) return text;
    return null;
}

function setupSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window)) {
        statusLine.textContent = "Micrófono no soportado";
        micBtn.disabled = true;
        return;
    }
    recognition = new webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "es-ES";
    recognition.onstart = () => { isRecording = true; statusLine.textContent = "Escuchando..."; };
    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        userInputEl.value = transcript;
        handleSend();
    };
    recognition.onerror = (event) => {
        console.error(event.error);
        isRecording = false;
        statusLine.textContent = "Error al escuchar";
    };
    recognition.onend = () => {
        isRecording = false;
        statusLine.textContent = "Lista para aprender contigo";
    };
}

function toggleMic() {
    if (!recognition) return;
    if (isRecording) {
        recognition.stop();
    } else {
        recognition.start();
    }
}

init();