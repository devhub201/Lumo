import type { MusicAction } from "./integrations";

export type MusicIntent =
  | { type: "play"; query: string }
  | {
      type: "control";
      action: Exclude<MusicAction, "toggle" | "seek" | "select">;
      value?: boolean;
    };

const commandSuffix = /[.!?]+$/;
const nonMusicPlayRequest =
  /^(?:devil['’]s advocate|(?:a\s+)?(?:word|number|guessing)\s+game(?:\s+with\s+me)?|(?:a\s+)?game(?:\s+with\s+me)?|a\s+joke)$/i;

function cleanQuery(value: string) {
  return value
    .trim()
    .replace(/^(["'])(.*)\1$/, "$2")
    .trim();
}

/** Parse explicit music commands without asking the small local model to invent tool access. */
export function parseMusicIntent(input: string): MusicIntent | null {
  const text = input.trim().replace(commandSuffix, "").trim();
  if (!text) return null;

  const play = text.match(
    /^(?:hey lumo,?\s*)?(?:please\s+)?(?:play|put on|start playing|listen to)\s+(.+?)(?:\s+on spotify)?$/i,
  );
  if (play?.[1]) {
    const query = cleanQuery(play[1]);
    const explicitlySpotify = /\s+on spotify$/i.test(text);
    if (query && (explicitlySpotify || !nonMusicPlayRequest.test(query))) {
      return { type: "play", query };
    }
  }

  const hindiPlay = text.match(/^(.+?)\s+(?:chalao|bajao|sunao|suna do)$/i);
  if (hindiPlay?.[1]) {
    const query = cleanQuery(hindiPlay[1]);
    if (query) return { type: "play", query };
  }

  if (
    /^(?:pause|stop|band\s+kar(?:o|\s+do)?|rok(?:o|\s+do)?)(?:\s+(?:the\s+)?(?:music|spotify|song|track|gaana|gana|playback))?$/i.test(
      text,
    ) ||
    /^(?:music|spotify|song|track|gaana|gana)\s+(?:band\s+kar(?:o|\s+do)?|rok(?:o|\s+do)?)$/i.test(
      text,
    )
  ) {
    return { type: "control", action: "pause" };
  }

  if (
    /^(?:resume|continue|unpause)(?:\s+(?:the\s+)?(?:music|spotify|song|track|playback))?$/i.test(
      text,
    ) ||
    /^(?:music|spotify|song|track|gaana|gana)\s+(?:chalu|continue)(?:\s+kar(?:o)?)?$/i.test(text)
  ) {
    return { type: "control", action: "resume" };
  }

  if (
    /^(?:next|skip)(?:\s+(?:track|song|gaana|gana))?$/i.test(text) ||
    /^agla\s+(?:track|song|gaana|gana)$/i.test(text)
  ) {
    return { type: "control", action: "next" };
  }

  if (
    /^(?:previous|back)(?:\s+(?:track|song|gaana|gana))?$/i.test(text) ||
    /^pichla\s+(?:track|song|gaana|gana)$/i.test(text)
  ) {
    return { type: "control", action: "previous" };
  }

  const shuffle = text.match(/^(?:turn\s+)?shuffle(?:\s+(on|off))?$/i);
  if (shuffle) {
    return {
      type: "control",
      action: "shuffle",
      ...(shuffle[1] ? { value: shuffle[1].toLowerCase() === "on" } : {}),
    };
  }

  const repeat = text.match(/^(?:turn\s+)?repeat(?:\s+(on|off))?$/i);
  if (repeat) {
    return {
      type: "control",
      action: "repeat",
      ...(repeat[1] ? { value: repeat[1].toLowerCase() === "on" } : {}),
    };
  }

  return null;
}
