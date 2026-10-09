// Botnoi transcripts carry bracketed annotations that aren't speech: turn tags
// ("2026-10-09 12:00:49 [turn=t1] Bot: ...") and system notes logged as a turn
// ("Bot: [ผู้ใช้พูดแทรกก่อนพูดจบ]"). They mean nothing to users and the tags
// break our "timestamp Role: text" parsing.
const BRACKETED_RE = /\s*\[[^\]]*\]\s*/g;

// A line whose role marker is left with no message once annotations are gone.
const EMPTY_TURN_RE = /\b(Bot|User|Assistant|Agent|Customer)\s*:\s*$/i;

/**
 * Clean a conversation log for display: remove every bracketed "[...]"
 * annotation and drop the lines left with nothing said.
 */
export function cleanConversationLog(log: string): string {
  return log
    .split("\n")
    .map((line) => line.replace(BRACKETED_RE, " ").replace(/\s{2,}/g, " ").trim())
    .filter((line) => line && !EMPTY_TURN_RE.test(line))
    .join("\n");
}
