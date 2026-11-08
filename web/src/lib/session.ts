/**
 * The session token, kept in the browser and sent as a bearer header. It works whatever the
 * origin of the API is: a cookie would not be sent to an API on another site (third-party
 * cookies are blocked by several browsers).
 */
const KEY = 'tamago_token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(KEY, token);
  } catch {
    // Storage blocked: the same-origin cookie still works.
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
