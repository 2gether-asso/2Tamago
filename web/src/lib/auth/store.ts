/**
 * What the browser keeps between visits: the refresh token and the key it is bound to.
 * IndexedDB stores the key itself (a `CryptoKey` that cannot be exported); if storage is
 * unavailable, they live in memory and a reload means signing in again.
 */
export interface StoredSession {
  refreshToken: string;
  key: CryptoKeyPair;
}

const DB = 'tamago-auth';
const STORE = 'session';
const ID = 'current';

/** Only used when IndexedDB fails: otherwise the database is the truth, shared by every tab. */
let fallback: StoredSession | null = null;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function loadSession(): Promise<StoredSession | null> {
  try {
    return ((await run('readonly', (store) => store.get(ID))) as StoredSession | undefined) ?? null;
  } catch {
    return fallback;
  }
}

export async function saveSession(session: StoredSession): Promise<void> {
  try {
    await run('readwrite', (store) => store.put(session, ID));
    fallback = null;
  } catch {
    // Storage unavailable (private mode, blocked): the memory copy keeps this visit going.
    fallback = session;
  }
}

export async function clearSession(): Promise<void> {
  fallback = null;
  try {
    await run('readwrite', (store) => store.delete(ID));
  } catch {
    // Nothing stored.
  }
}

/** The PKCE secret survives the trip to Discord and back, in this tab only. */
const VERIFIER = 'tamago_pkce';
export function keepVerifier(verifier: string): void {
  try {
    sessionStorage.setItem(VERIFIER, verifier);
  } catch {
    // Without it the sign-in cannot complete: the login page then shows the "expired" error.
  }
}
export function takeVerifier(): string | null {
  try {
    const verifier = sessionStorage.getItem(VERIFIER);
    sessionStorage.removeItem(VERIFIER);
    return verifier;
  } catch {
    return null;
  }
}
