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

    const systemPrompt = buildSystemPrompt(userName, hasPlan, planTopic);
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
- Resume en 2 frases máximo. Pregunta si quiere aprender algo específico.`;
}