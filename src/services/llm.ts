import axios from "axios";
import { Ollama } from "ollama";
import { config } from "../config.js";
import type { LLMStructuredResponse } from "../types.js";
import { llmResponseSchema } from "./schema.js";

const ollama = new Ollama({ host: config.ollamaHost });

export async function generateStructuredAnswer(prompt: string): Promise<LLMStructuredResponse> {
  const raw = await tryOllama(prompt).catch(async (ollamaError) => {
    console.warn("Ollama failed, attempting HF fallback:", getErrorMessage(ollamaError));
    return tryHf(prompt);
  });
  const parsed = safeJsonParse(raw);
  return llmResponseSchema.parse(parsed);
}

async function tryOllama(prompt: string): Promise<string> {
  const response = await ollama.generate({
    model: config.ollamaModel,
    prompt,
    stream: false,
  });
  return response.response;
}

async function tryHf(prompt: string): Promise<string> {
  if (!config.hfApiKey) {
    throw new Error("HF fallback unavailable: set HF_API_KEY, or start Ollama with the configured model.");
  }

  const fallbackModels = dedupeModels([
    config.hfModel,
    "Qwen/Qwen2.5-7B-Instruct",
    "meta-llama/Llama-3.1-8B-Instruct",
  ]);

  const errors: string[] = [];
  for (const model of fallbackModels) {
    try {
      const extracted = await callHfRouterChat(model, prompt, config.hfApiKey);
      if (!extracted) throw new Error("HF returned an empty generation payload.");
      return extracted;
    } catch (error) {
      errors.push(
        `[${model}] ${getErrorMessage(error)} | endpoint=https://router.huggingface.co/v1/chat/completions`
      );
    }
  }

  throw new Error(`HF fallback failed for all candidate models. Details: ${errors.join(" || ")}`);
}

function safeJsonParse(value: string): unknown {
  // Log raw response for debugging
  console.log("Raw LLM response length:", value.length);
  console.log("Raw LLM response preview:", value.slice(0, 200) + "...");

  // Remove markdown code blocks if present
  let cleaned = value.replace(/```json\s*/g, "").replace(/```\s*$/g, "").trim();

  // Try parsing the cleaned response
  try {
    return JSON.parse(cleaned);
  } catch (firstError) {
    console.log("First parse failed:", firstError instanceof Error ? firstError.message : String(firstError));
    // Fallback: extract JSON between first { and last }
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("LLM returned invalid JSON payload.");
    const jsonStr = cleaned.slice(start, end + 1);
    console.log("Extracted JSON length:", jsonStr.length);
    try {
      return JSON.parse(jsonStr);
    } catch (secondError) {
      console.log("Second parse failed:", secondError instanceof Error ? secondError.message : String(secondError));
      throw secondError;
    }
  }
}

function extractGeneratedText(data: unknown): string {
  if (typeof data === "string") return data;
  if (Array.isArray(data)) {
    const first = data[0] as { generated_text?: string } | undefined;
    return first?.generated_text ?? "";
  }
  if (data && typeof data === "object") {
    const typed = data as { generated_text?: string; error?: string };
    if (typed.error) throw new Error(`HF response error: ${typed.error}`);
    return typed.generated_text ?? "";
  }
  return "";
}

async function callHfRouterChat(model: string, prompt: string, apiKey: string): Promise<string> {
  const { data } = await axios.post<{
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string } | string;
  }>(
    "https://router.huggingface.co/v1/chat/completions",
    {
      model,
      messages: [
        { role: "system", content: "You must respond with only a valid JSON object. Do not include any markdown, code blocks, or extra text. The JSON must match the exact schema provided in the user message." },
        { role: "user", content: prompt },
      ],
      temperature: 0.0,
      max_tokens: 2000,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 45000,
    }
  );

  const errorValue = data?.error;
  if (errorValue) {
    const message = typeof errorValue === "string" ? errorValue : errorValue.message ?? "Unknown HF error";
    throw new Error(`HF router error: ${message}`);
  }
  return data?.choices?.[0]?.message?.content ?? "";
}

function dedupeModels(models: string[]): string[] {
  return [...new Set(models.map((model) => model.trim()).filter(Boolean))];
}

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? "no_status";
    const body =
      typeof error.response?.data === "string"
        ? error.response.data
        : JSON.stringify(error.response?.data ?? {});
    return `AxiosError status=${status} message=${error.message} body=${body}`;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
