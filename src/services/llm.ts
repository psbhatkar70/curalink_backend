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
    
    // Extract JSON between first { and last }
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("LLM returned invalid JSON payload.");
    
    let jsonStr = cleaned.slice(start, end + 1);
    console.log("Extracted JSON length:", jsonStr.length);
    
    try {
      return JSON.parse(jsonStr);
    } catch (secondError) {
      console.log("Second parse failed, attempting to fix JSON:", secondError instanceof Error ? secondError.message : String(secondError));
      
      // Try to fix common JSON issues
      try {
        // Remove unescaped newlines and carriage returns within the string
        jsonStr = jsonStr.replace(/\n/g, " ").replace(/\r/g, " ");
        
        // Fix unescaped quotes in string values by escaping them
        // This regex looks for quotes that appear after: word characters, closing brackets, or other quotes
        // and replaces them with escaped quotes IF they're not already escaped
        jsonStr = jsonStr.replace(/([^\\])"([^"]*?)([^\\])"/g, '$1\\"$2$3\\"');
        
        const parsed = JSON.parse(jsonStr);
        console.log("Successfully repaired JSON with regex fix");
        return parsed;
      } catch (thirdError) {
        console.log("Third parse failed, attempting aggressive JSON repair:", thirdError instanceof Error ? thirdError.message : String(thirdError));
        
        // Last resort: parse manually with strict field extraction
        try {
          const repaired = repairJsonString(jsonStr);
          console.log("Repaired JSON length:", repaired.length);
          const parsed = JSON.parse(repaired);
          console.log("Successfully repaired JSON with aggressive repair");
          return parsed;
        } catch (finalError) {
          console.log("All JSON parsing attempts failed:", finalError instanceof Error ? finalError.message : String(finalError));
          throw new Error(`Failed to parse LLM JSON after all repair attempts. Last error: ${finalError instanceof Error ? finalError.message : String(finalError)}`);
        }
      }
    }
  }
}

function repairJsonString(jsonStr: string): string {
  // Aggressive JSON repair: try to fix broken string values
  // This works by finding patterns and repairing them
  
  // Replace curly quotes with straight quotes
  jsonStr = jsonStr.replace(/[""]/g, '"').replace(/[']/g, "'");
  
  // Fix missing commas between objects in arrays
  jsonStr = jsonStr.replace(/}\s*{/g, '},{');
  jsonStr = jsonStr.replace(/}\s*\[/g, '},{');
  jsonStr = jsonStr.replace(/\]\s*{/g, '},{');
  
  // Fix trailing commas
  jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
  
  // Try to escape unescaped quotes within string values
  // Split by quotes and try to intelligently re-quote
  const parts = jsonStr.split('"');
  const repaired: string[] = [];
  
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      // Even indices: outside of strings (structural JSON)
      repaired.push(parts[i]);
    } else {
      // Odd indices: inside strings
      const stringValue = parts[i];
      // Escape any unescaped quotes and special chars
      const escaped = stringValue
        .replace(/\\/g, '\\\\') // Escape backslashes first
        .replace(/"/g, '\\"')   // Escape quotes
        .replace(/\n/g, '\\n') // Escape newlines
        .replace(/\r/g, '\\r') // Escape carriage returns
        .replace(/\t/g, '\\t'); // Escape tabs
      repaired.push('"' + escaped + '"');
    }
  }
  
  // Rejoin, but be careful not to double-quote
  let result = '';
  for (let i = 0; i < repaired.length; i++) {
    result += repaired[i];
  }
  
  return result;
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
