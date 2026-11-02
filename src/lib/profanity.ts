import terms from "./profanity-terms.json";

export const PROFANITY_ERROR =
  "Please revise the offensive English or Tagalog wording before sending. Your text has been kept so you can edit it.";
// Whole-token matching avoids substrings such as class, assistance, and Putatan.
// Check words and individually spaced letters separately: joining arbitrary words
// would incorrectly treat an ordinary phrase such as "put a sign" as profanity.
// Detection never rewrites the saved text.
const aliases: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "8": "b",
  "9": "g",
  "@": "a",
  $: "s",
  "!": "i",
};
const pattern = new RegExp(
  `(?:^|[^a-z])(?:${terms.map((word) => [...word].map((letter) => `${letter}+`).join("")).join("|")})(?=$|[^a-z])`,
  "i",
);
const spelledPattern = new RegExp(
  `(?:^|[^a-z])(?:${terms.map((word) => [...word].map((letter) => `${letter}+`).join("\\s+")).join("|")})(?=$|[^a-z])`,
  "i",
);
const phrasePattern =
  /(?:^|\s)(?:p+u+t+a+n+g+|t+a+n+g+)\s+i+n+a+(?:n+g+|m+o+)?(?=$|\s)/i;
export function hasProfanity(value: string): boolean {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[01345789]/g, (character) => aliases[character])
    .replace(/[@$!](?=[a-z])/g, (character) => aliases[character]);
  const words = normalized.replace(/[^a-z]+/g, " ");
  const joinedPunctuation = normalized
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ");
  return (
    pattern.test(words) ||
    pattern.test(joinedPunctuation) ||
    spelledPattern.test(words) ||
    phrasePattern.test(words)
  );
}
export function requireRespectfulText(value: string): void {
  if (hasProfanity(value)) throw new Error(PROFANITY_ERROR);
}
