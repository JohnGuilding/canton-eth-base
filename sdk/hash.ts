import { createHash } from "crypto";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hex32(input: string): `0x${string}` {
  return `0x${sha256Hex(input)}`;
}

export function toBytes32Hex(value: string): `0x${string}` {
  const normalized = value.startsWith("0x") ? value.slice(2) : value;
  return `0x${normalized.padStart(64, "0").slice(0, 64)}`;
}
