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
const variants = [
  ...new Set(
    terms.flatMap((word) => [
      word,
      word + "s",
      ...(/(?:ch|sh|ss|x|z)$/.test(word) ? [word + "es"] : []),
    ]),
  ),
];
const pattern = new RegExp(
  `(?:^|[^a-z])(?:${variants.map((word) => [...word].map((letter) => `${letter}+`).join("")).join("|")})(?=$|[^a-z])`,
  "i",
);
const spelledPattern = new RegExp(
  `(?:^|[^a-z])(?:${variants.map((word) => [...word].map((letter) => `${letter}+`).join("\\s+")).join("|")})(?=$|[^a-z])`,
  "i",
);
const phrasePattern =
  /(?:^|\s)(?:p+u+t+a+n+g+|t+a+n+g+)\s+i+n+a+(?:n+g+|m+o+)?(?=$|\s)/i;
export function hasProfanity(value: string): boolean {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, "")
    .toLowerCase()
    .replace(/[01345789]/g, (character) => aliases[character])
    .replace(/[@$!](?=[a-z])/g, (character) => aliases[character]);
  const words = normalized.replace(/[^a-z]+/g, " ");
  const joinedPunctuation = normalized
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ");
  const tokens = words.trim().split(/\s+/);
  // Join only short spelling chunks: "fu ck" is an evasion; "put a sign"
  // contains a normal three-letter word and must remain valid.
  for (let start = 0; start < tokens.length; start++) {
    let candidate = "";
    let hasLongChunk = false;
    for (let end = start; end < Math.min(tokens.length, start + 18); end++) {
      if (!tokens[end] || tokens[end].length > 3) break;
      hasLongChunk ||= tokens[end].length > 2;
      candidate += tokens[end];
      if (
        end > start &&
        (!hasLongChunk || end - start >= 2) &&
        pattern.test(candidate)
      )
        return true;
    }
  }
  return (
    pattern.test(words) ||
    pattern.test(joinedPunctuation) ||
    spelledPattern.test(words) ||
    phrasePattern.test(words)
  );
}
export function requireRespectfulText(value: string, field = "Message"): void {
  if (hasProfanity(value)) throw new Error(`${field}: ${PROFANITY_ERROR}`);
}
