export type Tone = "success" | "warning" | "danger" | "neutral";

export const TONE_DOT: Record<Tone, string> = {
  success: "bg-bamboo-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  neutral: "bg-gray-400",
};
