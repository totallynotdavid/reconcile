export const NICK_MIN = 3;
export const NICK_MAX = 20;

const SHAPE = /^[A-Za-z0-9](?:[A-Za-z0-9 _.-]*[A-Za-z0-9])?$/;

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t" };

/** Stems that are abusive on their own. Matched inside the folded name, so the list stays short and unambiguous. */
const BLOCKED = ["fuck", "shit", "bitch", "cunt", "whore", "nigger", "nigga", "faggot", "hitler", "nazi", "rapist"];

/** Two names with the same key are the same name: case, spacing and separators do not make a new identity. */
export const nicknameKey = (nickname: string) => nickname.toLowerCase().replace(/[ _.-]/g, "");

const fold = (nickname: string) => nicknameKey(nickname).replace(/[013457]/g, (c) => LEET[c]);

export type NicknameCheck = { ok: true; nickname: string } | { ok: false; error: string };

export function checkNickname(raw: unknown): NicknameCheck {
  if (typeof raw !== "string") return { ok: false, error: "Pick a nickname." };
  const nickname = raw.replace(/\s+/g, " ").trim();
  if (nickname.length < NICK_MIN) return { ok: false, error: `Use at least ${NICK_MIN} characters.` };
  if (nickname.length > NICK_MAX) return { ok: false, error: `Use at most ${NICK_MAX} characters.` };
  if (!SHAPE.test(nickname)) return { ok: false, error: "Use letters, digits, spaces, dots, dashes and underscores." };
  const folded = fold(nickname);
  if (BLOCKED.some((word) => folded.includes(word))) return { ok: false, error: "That nickname is not allowed." };
  return { ok: true, nickname };
}
