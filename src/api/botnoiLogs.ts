import { api } from "./client";
import { getToken } from "./authToken";

// Botnoi conversation logs, read through the Go API proxy (/api/v1/botnoi-logs),
// which forwards to the Botnoi Voicebot API with the server-side token. The
// Botnoi responses are passed through untouched because their shape is not
// documented, so the helpers below read them defensively.

const BASE_URL = import.meta.env.VITE_CALLECTO_API_URL || "http://localhost:1818/api/v1";

export interface BotnoiConversation {
  /** Conversation id parsed from the file name (UUID), or the file name itself. */
  id: string;
  /** Date + time parsed from the file name, e.g. "2026-06-16 17:10:06". */
  startedAt: string | null;
  /** The conversation's .txt file; used for both the transcript and the recording. */
  logPath: string | null;
}

export interface BotnoiChatTurn {
  role: "bot" | "user" | "other";
  text: string;
  time?: string;
}

const FILE_NAME_RE = /(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})/;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const PATH_KEYS = ["file_path", "filepath", "path", "key", "Key", "file", "name", "filename"];

/** Collect every file path in an unknown list_file response. */
function collectPaths(value: unknown, out: string[]) {
  if (typeof value === "string") {
    if (/\.(txt|json)$/i.test(value)) out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v) => collectPaths(v, out));
    return;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const key = PATH_KEYS.find((k) => typeof obj[k] === "string");
    if (key) {
      out.push(obj[key] as string);
      return;
    }
    Object.values(obj).forEach((v) => collectPaths(v, out));
  }
}

function conversationKey(path: string): string {
  const fileName = path.split("/").pop() || path;
  return fileName.match(UUID_RE)?.[0] ?? fileName.replace(/\.[^.]+$/, "");
}

export async function listBotnoiConversations(startDate: string, endDate: string): Promise<BotnoiConversation[]> {
  const res = await api.get<{ data: unknown }>("/botnoi-logs/files", { start_date: startDate, end_date: endDate });

  const paths: string[] = [];
  collectPaths(res.data, paths);

  const byId = new Map<string, BotnoiConversation>();
  for (const path of paths) {
    const id = conversationKey(path);
    const conv = byId.get(id) ?? { id, startedAt: null, logPath: null };
    const m = path.match(FILE_NAME_RE);
    if (m && !conv.startedAt) conv.startedAt = `${m[1]} ${m[2].replace(/-/g, ":")}`;
    conv.logPath = path;
    byId.set(id, conv);
  }

  return [...byId.values()].sort((a, b) => (b.startedAt || "").localeCompare(a.startedAt || ""));
}

export async function readBotnoiLog(filePath: string): Promise<unknown> {
  const res = await api.get<{ data: unknown }>("/botnoi-logs/log", { file_path: filePath });
  return res.data;
}

function toRole(value: unknown): BotnoiChatTurn["role"] {
  const r = String(value ?? "").toLowerCase();
  if (["bot", "assistant", "agent", "ai", "system"].includes(r)) return "bot";
  if (["user", "human", "customer", "caller"].includes(r)) return "user";
  return "other";
}

/**
 * Turn a read_log response into chat turns. Handles plain text
 * ("... Bot: hi" / "User: hi" lines) and arrays of {role, text} objects;
 * returns null when the shape is not recognised so the caller can show raw JSON.
 */
export function parseBotnoiLog(data: unknown): BotnoiChatTurn[] | null {
  if (typeof data === "string") {
    const turns = data
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line): BotnoiChatTurn => {
        const m = line.match(/^(?:(\d{4}-\d{2}-\d{2}\s+(\d{2}:\d{2}:\d{2}))\s+)?(Bot|User|Assistant|Agent|Customer)\s*:\s*(.*)$/i);
        return m ? { role: toRole(m[3]), text: m[4], time: m[2] } : { role: "other", text: line };
      });
    return turns.length ? turns : null;
  }

  if (Array.isArray(data)) {
    const turns = data
      .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
      .map((t) => ({
        role: toRole(t.role ?? t.speaker ?? t.sender ?? t.from),
        text: String(t.text ?? t.message ?? t.content ?? t.transcript ?? ""),
        time: t.time || t.timestamp ? String(t.time ?? t.timestamp) : undefined,
      }))
      .filter((t) => t.text);
    return turns.length ? turns : null;
  }

  if (data && typeof data === "object") {
    // read_log answers { key, text } — the transcript is in `text`.
    const obj = data as Record<string, unknown>;
    if (typeof obj.text === "string") return parseBotnoiLog(obj.text);
    for (const value of Object.values(obj)) {
      const turns = parseBotnoiLog(value);
      if (turns) return turns;
    }
  }
  return null;
}

/**
 * Fetch a conversation's recording (by its .txt log path) and return a blob: URL
 * for an <audio> element, plus the audio MIME type. Caller must revoke the URL.
 */
export async function getBotnoiAudioBlobUrl(filePath: string): Promise<{ url: string; type: string }> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}/botnoi-logs/audio?file_path=${encodeURIComponent(filePath)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Botnoi audio failed (${res.status})`);
  const blob = await res.blob();
  return { url: URL.createObjectURL(blob), type: blob.type };
}
