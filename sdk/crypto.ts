import { createCipheriv, createDecipheriv, createECDH, createHash, hkdfSync, randomBytes } from "crypto";

export interface RecipientKeyPair {
  id: string;
  curve: "secp256k1";
  publicKey: string;
  privateKey: string;
}

export interface RecipientPublicKey {
  id: string;
  curve: "secp256k1";
  publicKey: string;
}

export interface WrappedKey {
  recipientId: string;
  ephemeralPublicKey: string;
  iv: string;
  authTag: string;
  wrappedKey: string;
  algorithm: "ECDH-AES-256-GCM";
}

export interface CipherEnvelope {
  algorithm: "AES-256-GCM";
  iv: string;
  authTag: string;
  ciphertext: string;
}

const IV_BYTES = 12;

function b64(value: Buffer | ArrayBuffer): string {
  return Buffer.from(value).toString("base64");
}

function fromB64(value: string): Buffer {
  return Buffer.from(value, "base64");
}

export function generateRecipientKeyPair(id: string): RecipientKeyPair {
  const ecdh = createECDH("secp256k1");
  ecdh.generateKeys();
  return {
    id,
    curve: "secp256k1",
    publicKey: ecdh.getPublicKey("base64", "compressed"),
    privateKey: ecdh.getPrivateKey("base64")
  };
}

export function toRecipientPublicKey(keyPair: RecipientKeyPair): RecipientPublicKey {
  return {
    id: keyPair.id,
    curve: keyPair.curve,
    publicKey: keyPair.publicKey
  };
}

function deriveWrapKey(sharedSecret: Buffer, context: string): Buffer {
  return Buffer.from(hkdfSync("sha256", sharedSecret, Buffer.alloc(0), Buffer.from(context), 32));
}

export function encryptAesGcm(plaintext: Buffer, key: Buffer): CipherEnvelope {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    algorithm: "AES-256-GCM",
    iv: b64(iv),
    authTag: b64(cipher.getAuthTag()),
    ciphertext: b64(ciphertext)
  };
}

export function decryptAesGcm(envelope: CipherEnvelope, key: Buffer): Buffer {
  const decipher = createDecipheriv("aes-256-gcm", key, fromB64(envelope.iv));
  decipher.setAuthTag(fromB64(envelope.authTag));
  return Buffer.concat([decipher.update(fromB64(envelope.ciphertext)), decipher.final()]);
}

export function encryptJson(value: unknown, key: Buffer): CipherEnvelope {
  return encryptAesGcm(Buffer.from(JSON.stringify(value)), key);
}

export function decryptJson<T>(envelope: CipherEnvelope, key: Buffer): T {
  return JSON.parse(decryptAesGcm(envelope, key).toString("utf8")) as T;
}

export function wrapDekForRecipient(dek: Buffer, recipient: RecipientPublicKey, context: string): WrappedKey {
  const ephemeral = createECDH("secp256k1");
  ephemeral.generateKeys();
  const sharedSecret = ephemeral.computeSecret(Buffer.from(recipient.publicKey, "base64"));
  const wrapKey = deriveWrapKey(sharedSecret, context);
  const wrapped = encryptAesGcm(dek, wrapKey);

  return {
    recipientId: recipient.id,
    ephemeralPublicKey: ephemeral.getPublicKey("base64", "compressed"),
    iv: wrapped.iv,
    authTag: wrapped.authTag,
    wrappedKey: wrapped.ciphertext,
    algorithm: "ECDH-AES-256-GCM"
  };
}

export function unwrapDekForRecipient(wrappedKey: WrappedKey, recipient: RecipientKeyPair, context: string): Buffer {
  const recipientEcdh = createECDH("secp256k1");
  recipientEcdh.setPrivateKey(Buffer.from(recipient.privateKey, "base64"));
  const sharedSecret = recipientEcdh.computeSecret(Buffer.from(wrappedKey.ephemeralPublicKey, "base64"));
  const wrapKey = deriveWrapKey(sharedSecret, context);
  return decryptAesGcm(
    {
      algorithm: "AES-256-GCM",
      iv: wrappedKey.iv,
      authTag: wrappedKey.authTag,
      ciphertext: wrappedKey.wrappedKey
    },
    wrapKey
  );
}

export function randomDek(): Buffer {
  return randomBytes(32);
}

export function hashBase64(value: string): string {
  return createHash("sha256").update(fromB64(value)).digest("hex");
}
