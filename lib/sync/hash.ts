import { createHash } from "crypto";

export function hashRow(row: string[]): string {
  return createHash("sha256").update(JSON.stringify(row)).digest("hex");
}
