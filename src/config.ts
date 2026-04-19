import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT ?? 8080),
  mongoUri: process.env.MONGODB_URI ?? "",
  dbName: process.env.MONGODB_DB ?? "curalink",
  cacheTtlSeconds: Number(process.env.CACHE_TTL_SECONDS ?? 3600),
  ollamaModel: process.env.OLLAMA_MODEL ?? "qwen2.5:7b-instruct",
  ollamaHost: process.env.OLLAMA_HOST,
  hfApiKey: process.env.HF_API_KEY,
  hfModel: process.env.HF_MODEL ?? "HuggingFaceH4/zephyr-7b-beta",
};
