import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";

export function localStorageEnabled(): boolean {
  return process.env.SLATE_STORAGE === "local";
}

function directory(): string {
  // Runtime user data must never be bundled into a deployment.
  return resolve(/* turbopackIgnore: true */ process.env.SLATE_LOCAL_DIR || ".slate-local");
}

function objectPath(key: string): string {
  return join(directory(), `${createHash("sha256").update(key).digest("hex")}.json`);
}

export async function localReady(): Promise<void> {
  await mkdir(directory(), { recursive: true, mode: 0o700 });
}

export async function localGet(key: string): Promise<{ body: Uint8Array; type: string } | null> {
  try {
    const value = JSON.parse(await readFile(/* turbopackIgnore: true */ objectPath(key), "utf8")) as { key: string; body: string; type: string };
    if (value.key !== key) throw new Error("Local storage key mismatch.");
    return { body: Buffer.from(value.body, "base64"), type: value.type };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function localPut(key: string, body: Uint8Array, type: string): Promise<void> {
  await localReady();
  const target = objectPath(key);
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify({ key, type, body: Buffer.from(body).toString("base64") }), { mode: 0o600 });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function localDelete(key: string): Promise<void> {
  await rm(objectPath(key), { force: true });
}

export async function localKeys(prefix: string): Promise<string[]> {
  await localReady();
  const keys = await Promise.all((await readdir(/* turbopackIgnore: true */ directory())).filter((name) => /^[a-f0-9]{64}\.json$/.test(name)).map(async (name) => {
    try {
      return (JSON.parse(await readFile(/* turbopackIgnore: true */ join(directory(), name), "utf8")) as { key: string }).key;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
      throw error;
    }
  }));
  return keys.filter((key) => key.startsWith(prefix)).sort();
}
