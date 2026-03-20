import { loadConfig } from "../utils/config";

interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

interface AIResponse {
    content: string;
    error?: string;
}

/**
 * Call an OpenAI-compatible chat completions API.
 * Works with OpenAI, Ollama, LM Studio, together.ai, etc.
 */
export async function callAI(
    messages: ChatMessage[],
    options?: { maxTokens?: number; temperature?: number }
): Promise<AIResponse> {
    const config = await loadConfig();
    const apiKey = process.env.DEVCTX_AI_KEY || config.aiApiKey;
    const baseUrl = process.env.DEVCTX_AI_PROVIDER || config.aiProvider;
    const model = process.env.DEVCTX_AI_MODEL || config.aiModel;

    if (!apiKey && baseUrl.includes("openai.com")) {
        return {
            content: "",
            error:
                "No API key configured. Set DEVCTX_AI_KEY env var or run: devctx config set aiApiKey <key>",
        };
    }

    try {
        const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;

        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };
        if (apiKey) {
            headers["Authorization"] = `Bearer ${apiKey}`;
        }

        const response = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify({
                model,
                messages,
                max_tokens: options?.maxTokens || 1024,
                temperature: options?.temperature ?? 0.3,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            return {
                content: "",
                error: `AI API error (${response.status}): ${errorText.slice(0, 200)}`,
            };
        }

        const data = (await response.json()) as any;
        const content = data.choices?.[0]?.message?.content || "";

        return { content };
    } catch (err: any) {
        return {
            content: "",
            error: `AI request failed: ${err.message}`,
        };
    }
}
