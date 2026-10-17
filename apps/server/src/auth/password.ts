import { hash, verify } from "@node-rs/argon2";

// @node-rs/argon2 defaults to argon2id; we pin the params explicitly (OWASP-ish minimums).
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (password: string) => hash(password, OPTS);

export async function verifyPassword(hashed: string, password: string): Promise<boolean> {
  try {
    return await verify(hashed, password);
  } catch {
    return false;
  }
}

// Verified against when the email doesn't exist so timing doesn't reveal account existence.
let dummy: Promise<string> | undefined;
export const dummyHash = () => (dummy ??= hashPassword("not-a-real-password"));
