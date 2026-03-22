// background.js — Service Worker de AlejandrIA

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Reenvía mensajes STT del content script al side panel
// Necesitamos una conexión persistente para esto
const sidePanelPorts = new Set();

chrome.runtime.onConnect.addListener((port) => {
    if (port.name === "sidepanel") {
        sidePanelPorts.add(port);
        port.onDisconnect.addListener(() => sidePanelPorts.delete(port));
    }
});

function notifySidePanel(message) {
    sidePanelPorts.forEach(port => {
        try { port.postMessage(message); } catch { }
    });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    // ── Lee el DOM de la página activa ──
    if (message.type === "GET_PAGE_CONTEXT") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]) return sendResponse({ error: "No hay pestaña activa" });
            chrome.tabs.sendMessage(tabs[0].id, { type: "READ_PAGE" }, (response) => {
                if (chrome.runtime.lastError) {
                    chrome.scripting.executeScript(
                        { target: { tabId: tabs[0].id }, files: ["content.js"] },
                        () => {
                            setTimeout(() => {
                                chrome.tabs.sendMessage(tabs[0].id, { type: "READ_PAGE" }, sendResponse);
                            }, 400);
                        }
                    );
                } else {
                    sendResponse(response);
                }
            });
        });
        return true;
    }

    // ── URL de la pestaña activa ──
    if (message.type === "GET_ACTIVE_TAB_URL") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            sendResponse({ url: tabs[0]?.url || "", title: tabs[0]?.title || "" });
        });
        return true;
    }

    // ── Inyecta content script y empieza a grabar ──
    if (message.type === "START_RECORDING") {
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            if (!tabs[0]) return;
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tabs[0].id },
                    files: ["content.js"]
                });
            } catch (e) { } // ya estaba inyectado
            chrome.tabs.sendMessage(tabs[0].id, { type: "START_RECORDING" });
        });
        return true;
    }

    // ── Para la grabación ──
    if (message.type === "STOP_RECORDING") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { type: "STOP_RECORDING" });
        });
        return true;
    }

    // ── Reenvía resultados STT al side panel via puerto ──
    if (message.type === "STT_RESULT" || message.type === "STT_ERROR" || message.type === "STT_END") {
        notifySidePanel(message);
        return true;
    }
});