let recognition = null;

chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "START_RECORDING") startRecognition();
    if (message.type === "STOP_RECORDING") stopRecognition();
});

function startRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        chrome.runtime.sendMessage({ type: "STT_ERROR", error: "no_support" });
        return;
    }
    recognition = new SR();
    recognition.lang = "es-CO";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (e) => {
        const transcript = e.results[0][0].transcript;
        chrome.runtime.sendMessage({ type: "STT_RESULT", transcript });
    };
    recognition.onerror = (e) => {
        chrome.runtime.sendMessage({ type: "STT_ERROR", error: e.error });
    };
    recognition.onend = () => {
        chrome.runtime.sendMessage({ type: "STT_END" });
    };
    recognition.start();
}

function stopRecognition() {
    try { recognition?.stop(); } catch { }
}