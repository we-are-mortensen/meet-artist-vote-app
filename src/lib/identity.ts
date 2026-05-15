"use client";

import type { StoredIdentity } from "@/types/poll.types";

const STORAGE_KEY = "artistVote.identity";

/**
 * Reads the participant identity from sessionStorage.
 * Returns null on the server, when no identity is set, or when the stored
 * value is malformed.
 */
export function getIdentity(): StoredIdentity | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredIdentity;
    if (typeof parsed?.id === "string" && typeof parsed?.name === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function setIdentity(identity: StoredIdentity): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
}

export function clearIdentity(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
}
