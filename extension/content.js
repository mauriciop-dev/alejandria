// content.js — Lee la página y maneja el micrófono para AlejandrIA

let recognition = null;
let isRecognizing = false; // bandera para evitar doble disparo

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "READ_PAGE") {
        sendResponse(extractPageContext());
    }
    if (message.type === "START_RECORDING") {
        startRecognition();
        sendResponse({ ok: true });
    }
    if (message.type === "STOP_RECORDING") {
        stopRecognition();
        sendResponse({ ok: true });
    }
    return true;
});

function startRecognition() {
    if (isRecognizing) return; // evita doble inicio

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        chrome.runtime.sendMessage({ type: "STT_ERROR", error: "no_support" });
        return;
    }
    try {
        recognition = new SR();
        recognition.lang = "es-CO";
        recognition.continuous = false;
        recognition.interimResults = false;
        isRecognizing = true;

        recognition.onresult = (e) => {
            const transcript = e.results[0][0].transcript;
            isRecognizing = false;
            chrome.runtime.sendMessage({ type: "STT_RESULT", transcript });
        };

        recognition.onerror = (e) => {
            isRecognizing = false;
            chrome.runtime.sendMessage({ type: "STT_ERROR", error: e.error });
        };

        recognition.onend = () => {
            isRecognizing = false;
            chrome.runtime.sendMessage({ type: "STT_END" });
        };

        recognition.start();
    } catch (err) {
        isRecognizing = false;
        chrome.runtime.sendMessage({ type: "STT_ERROR", error: err.message });
    }
}

function stopRecognition() {
    isRecognizing = false;
    try { recognition?.stop(); recognition = null; } catch { }
}

function extractPageContext() {
    const title = document.title || "";
    const url = window.location.href;
    const metaDesc = document.querySelector('meta[name="description"]')?.content || "";
    const headings = Array.from(document.querySelectorAll("h1, h2"))
        .slice(0, 8).map(h => h.innerText.trim()).filter(t => t.length > 0);
    const paragraphs = Array.from(document.querySelectorAll("p, article, main, section"))
        .map(el => el.innerText.trim())
        .filter(t => t.length > 80)
        .slice(0, 5).join(" ").substring(0, 2000);
    const hasVideo = !!(document.querySelector("video, iframe[src*='youtube'], iframe[src*='vimeo']"));
    const platform = detectPlatform(url);
    return { title, url, metaDesc, headings, paragraphs, hasVideo, platform, timestamp: Date.now() };
}

function detectPlatform(url) {
    const platforms = {
        "youtube.com": "YouTube", "udemy.com": "Udemy", "coursera.org": "Coursera",
        "platzi.com": "Platzi", "notion.so": "Notion", "github.com": "GitHub",
        "stackoverflow.com": "Stack Overflow", "medium.com": "Medium",
        "docs.google.com": "Google Docs", "figma.com": "Figma"
    };
    for (const [domain, name] of Object.entries(platforms)) {
        if (url.includes(domain)) return name;
    }
    return "web";
}