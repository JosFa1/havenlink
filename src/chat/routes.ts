/**
 * "Ask HavenLink" chatbot endpoint.
 *
 *   POST /api/chat   { message: string, history?: {role, text}[] }  ->  { reply }
 *
 * Public (no auth/CSRF, like the partnership form) but rate limited to keep the
 * Gemini bill/quota in check. The knowledge base is injected as the system
 * instruction, so retrieval is just "send the whole site + the conversation".
 */
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { GoogleGenAI } from "@google/genai";
import type { Content } from "@google/genai";
import { config } from "../config";
import { getSystemInstruction } from "./knowledge";

export const chatRouter = Router();

// Limits on what we accept from the client, to bound token usage per request.
const MAX_MESSAGE_CHARS = 2000;
const MAX_HISTORY_TURNS = 12; // ~6 back-and-forth exchanges

// Lazily construct the client on first use so the app boots even with no key set,
// and so a missing key produces a clear 503 instead of a crash.
let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI | null {
  if (client) return client;
  if (config.GEMINI_USE_VERTEX) {
    if (!config.GOOGLE_CLOUD_PROJECT) return null;
    // In prod (App Runner) there is no gcloud login, so authenticate with the
    // service-account key passed via env. Locally, GEMINI_SA_KEY is unset and the
    // SDK falls back to Application Default Credentials (the developer's gcloud login).
    let googleAuthOptions: { credentials: Record<string, unknown> } | undefined;
    if (config.GEMINI_SA_KEY) {
      try {
        googleAuthOptions = { credentials: JSON.parse(config.GEMINI_SA_KEY) };
      } catch {
        console.error("GEMINI_SA_KEY is not valid JSON; falling back to ADC.");
      }
    }
    client = new GoogleGenAI({
      vertexai: true,
      project: config.GOOGLE_CLOUD_PROJECT,
      location: config.GEMINI_LOCATION,
      googleAuthOptions,
    });
  } else {
    if (!config.GEMINI_API_KEY) return null;
    client = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
  }
  return client;
}

// 20 messages per 5 minutes per IP. Generous for a real visitor, a wall for abuse.
const chatLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    reply:
      "You're sending messages a little fast. Please wait a moment and try again.",
  },
});

interface HistoryTurn {
  role: unknown;
  text: unknown;
}

/** Turn the client-supplied history + new message into Gemini `contents`. */
function buildContents(message: string, history: unknown): Content[] {
  const contents: Content[] = [];
  if (Array.isArray(history)) {
    for (const turn of history.slice(-MAX_HISTORY_TURNS) as HistoryTurn[]) {
      const role = turn?.role === "model" ? "model" : "user";
      const text = String(turn?.text ?? "").slice(0, MAX_MESSAGE_CHARS);
      if (text.trim()) contents.push({ role, parts: [{ text }] });
    }
  }
  contents.push({ role: "user", parts: [{ text: message }] });
  return contents;
}

chatRouter.post("/", chatLimiter, async (req, res) => {
  try {
    const ai = getClient();
    if (!ai) {
      return res.status(503).json({
        reply:
          "The assistant isn't available right now. Please email us at havenlink.org@gmail.com and we'll be glad to help.",
      });
    }

    const rawMessage = req.body?.message;
    if (typeof rawMessage !== "string" || rawMessage.trim().length === 0) {
      return res.status(400).json({ error: "A 'message' string is required." });
    }
    const message = rawMessage.slice(0, MAX_MESSAGE_CHARS);

    const response = await ai.models.generateContent({
      model: config.GEMINI_MODEL,
      contents: buildContents(message, req.body?.history),
      config: {
        systemInstruction: getSystemInstruction(),
        temperature: 0.3,
        maxOutputTokens: 800,
      },
    });

    const reply = response.text?.trim();
    if (!reply) {
      // Empty completions usually mean a safety block or an over-length prompt.
      return res.json({
        reply:
          "Sorry, I couldn't answer that one. Try rephrasing, or reach the team at havenlink.org@gmail.com.",
      });
    }
    res.json({ reply });
  } catch (error) {
    console.error(
      "Chat error:",
      error instanceof Error ? error.message : String(error)
    );
    res.status(500).json({
      reply:
        "Something went wrong on our side. Please try again in a moment, or email havenlink.org@gmail.com.",
    });
  }
});
