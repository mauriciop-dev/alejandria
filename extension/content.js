// content.js — Lee la página y extrae contexto útil para AlejandrIA

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "READ_PAGE") {
        sendResponse(extractPageContext());
    }
    return true;
});

function extractPageContext() {
    const title = document.title || "";
    const url = window.location.href;
    const metaDesc = document.querySelector('meta[name="description"]')?.content || "";
    const headings = Array.from(document.querySelectorAll("h1, h2"))
        .slice(0, 8).map(h => h.innerText.trim()).filter(t => t.length > 0);
    const paragraphs = Array.from(document.querySelectorAll("p, article, main"))
        .map(el => el.innerText.trim()).filter(t => t.length > 80)
        .slice(0, 5).join(" ").substring(0, 1500);
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