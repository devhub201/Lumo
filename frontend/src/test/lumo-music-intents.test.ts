import { describe, expect, it } from "vitest";
import { parseMusicIntent } from "@/lib/lumo/music-intents";

describe("parseMusicIntent", () => {
  it("extracts a track query from an explicit play request", () => {
    expect(parseMusicIntent("Hey LUMO, play 'Midnight City' on Spotify!")).toEqual({
      type: "play",
      query: "Midnight City",
    });
  });

  it("accepts a Hinglish play request", () => {
    expect(parseMusicIntent("Arijit ka gaana chalao")).toEqual({
      type: "play",
      query: "Arijit ka gaana",
    });
  });

  it.each([
    ["pause music", { type: "control", action: "pause" }],
    ["gaana band kar do", { type: "control", action: "pause" }],
    ["resume playback", { type: "control", action: "resume" }],
    ["next song", { type: "control", action: "next" }],
    ["pichla gaana", { type: "control", action: "previous" }],
    ["shuffle off", { type: "control", action: "shuffle", value: false }],
    ["repeat on", { type: "control", action: "repeat", value: true }],
  ] as const)("parses %s", (input, expected) => {
    expect(parseMusicIntent(input)).toEqual(expected);
  });

  it("does not turn ordinary chat into a Spotify command", () => {
    expect(parseMusicIntent("I played football yesterday and feel tired.")).toBeNull();
    expect(parseMusicIntent("Can you explain how Spotify works?")).toBeNull();
    expect(parseMusicIntent("play devil's advocate")).toBeNull();
    expect(parseMusicIntent("play a word game with me")).toBeNull();
    expect(parseMusicIntent("play a game")).toBeNull();
    expect(parseMusicIntent("play ''")).toBeNull();
    expect(parseMusicIntent("'' chalao")).toBeNull();
  });

  it("allows an otherwise ambiguous query when Spotify is explicitly named", () => {
    expect(parseMusicIntent("play devil's advocate on Spotify")).toEqual({
      type: "play",
      query: "devil's advocate",
    });
  });
});
