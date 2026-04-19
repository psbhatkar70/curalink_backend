import { createHash } from "node:crypto";

export function hashQuery(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
