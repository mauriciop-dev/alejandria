import express from "express";
import cors from "cors";
import { config } from "dotenv";
config();

const app = express();
app.use(cors());
app.use(express.json());

// Import the chat handler
const { default: handler } = await import("./backend/api/chat.js");

app.post("/api/chat", (req, res) => handler(req, res));
app.get("/", (req, res) => res.send("AlejandrIA backend corriendo ✓"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n✦ AlejandrIA backend en http://localhost:${PORT}`);
    console.log(`  Gemini API key: ${process.env.GEMINI_API_KEY ? "✓ configurada" : "✗ FALTA en .env"}\n`);
});
