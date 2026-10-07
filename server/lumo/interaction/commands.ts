import type { InteractionMode } from "./contracts";
export type ModeCommand = { mode: InteractionMode; raw: string };
const rules: Array<[InteractionMode, RegExp]> = [
  ["voice", /^(?:lumo[,:]?\s*)?(?:voice mode|voice mein aa|voice on)$/i],
  [
    "text",
    /^(?:lumo[,:]?\s*)?(?:text mode|chat pe aa|voice band karo|text par aa)$/i,
  ],
  ["camera", /^(?:lumo[,:]?\s*)?(?:camera kholo|open camera|camera mode)$/i],
  ["teaching", /^(?:lumo[,:]?\s*)?(?:teaching mode|teach me|sikhao)$/i],
  ["blueprint", /^(?:lumo[,:]?\s*)?(?:blueprint kholo|blueprint mode)$/i],
];
export const detectModeCommand = (text: string): ModeCommand | null => {
  const raw = text.trim();
  const found = rules.find(([, pattern]) => pattern.test(raw));
  return found ? { mode: found[0], raw } : null;
};
