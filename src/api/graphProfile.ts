// Persistence for the Microsoft Graph profile fetched at sign-in.
//
// The Graph access token is short-lived and intentionally NOT stored; we persist
// only the resulting profile so it survives a page reload and is available to the
// UI. Cleared on sign-out alongside the Callecto session.

import type { GraphProfile } from "./graph";

const GRAPH_PROFILE_KEY = "callecto_graph_profile";

export function getStoredGraphProfile(): GraphProfile | null {
  const raw = localStorage.getItem(GRAPH_PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GraphProfile;
  } catch {
    return null;
  }
}

export function setStoredGraphProfile(profile: GraphProfile): void {
  localStorage.setItem(GRAPH_PROFILE_KEY, JSON.stringify(profile));
}

export function clearStoredGraphProfile(): void {
  localStorage.removeItem(GRAPH_PROFILE_KEY);
}
