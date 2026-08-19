const SESSION_STORAGE_KEY = "3dvista-assistant:session-id";

/**
 * Anonymous per-visitor session id, persisted only in sessionStorage (cleared
 * when the tab closes) — matches the doc's "anonymous sessions, minimal
 * retention" requirement.
 */
export function getOrCreateSessionId(): string {
  try {
    const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, id);
    return id;
  } catch {
    // sessionStorage unavailable (e.g. restrictive iframe sandbox) — fall
    // back to an in-memory id for the lifetime of the page.
    return crypto.randomUUID();
  }
}
