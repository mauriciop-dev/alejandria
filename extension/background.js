// background.js — Service Worker de AlejandrIA

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

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
                            }, 300);
                        }
                    );
                } else {
                    sendResponse(response);
                }
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