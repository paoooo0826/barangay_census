// A local document-content screen, not issuer authentication. Never marks an ID
// verified: the existing administrator review remains the final decision.
export const GOVERNMENT_ID_TYPES = [
  "PhilSys ID",
  "Driver's License",
  "Passport",
  "UMID",
  "Postal ID",
  "Voter's ID",
] as const;

export interface IdDocumentCheck {
  status: "recognized" | "manual_review";
  reason: string;
}

const HEADINGS: Record<(typeof GOVERNMENT_ID_TYPES)[number], RegExp> = {
  "PhilSys ID":
    /\b(?:PHILSYS|PHILIPPINE IDENTIFICATION(?: CARD)?|PAMBANSANG PAGKAKAKILANLAN)\b/,
  "Driver's License":
    /\b(?:DRIVER S LICENSE|DRIVERS LICENSE|DRIVER LICENSE|LAND TRANSPORTATION OFFICE)\b/,
  Passport: /\b(?:PASSPORT|PASAPORTE)\b/,
  UMID: /\b(?:UMID|UNIFIED MULTI ?PURPOSE (?:ID|IDENTIFICATION))\b/,
  "Postal ID": /\b(?:POSTAL (?:ID|IDENTIFICATION)|PHILIPPINE POSTAL|PHLPOST)\b/,
  "Voter's ID":
    /\b(?:COMMISSION ON ELECTIONS|COMELEC|VOTER S IDENTIFICATION|VOTER S ID|VOTERS ID)\b/,
};
const NAME = /\b(?:NAME|NAMES|SURNAME|APELYIDO|PANGALAN)\b/;
const DETAIL_LABELS = [
  /\b(?:BIRTH|KAPANGANAKAN|DOB)\b/,
  /\b(?:SEX|KASARIAN|GENDER)\b/,
  /\b(?:ADDRESS|TIRAHAN)\b/,
  /\b(?:CRN|PCN|PSN|NUMBER|NO|ID NO|LICENSE NO|PASSPORT NO|VIN|PRECINCT)\b/,
];

function normalize(text: string) {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

export function inspectIdText(
  text: string,
  confidence: number,
  selectedType: string,
): IdDocumentCheck {
  if (!selectedType.trim())
    throw new Error(
      "Select the government ID type before checking the picture.",
    );
  const content = normalize(text);
  const types = GOVERNMENT_ID_TYPES.filter((type) =>
    HEADINGS[type].test(content),
  );
  const readable =
    content.replace(/[^A-Z]/g, "").length >= 40 &&
    content.split(" ").length >= 8;
  const hasDetails =
    NAME.test(content) &&
    DETAIL_LABELS.filter((label) => label.test(content)).length >= 2;
  const hasValues = /\d/.test(content);
  if (!readable || !hasDetails || !hasValues) {
    throw new Error(
      "A readable government ID was not found. Show the whole ID front, including its title, name, photo, and printed details. Selfies and unrelated pictures cannot be used as an ID.",
    );
  }
  const selected = GOVERNMENT_ID_TYPES.find(
    (type) => normalize(type) === normalize(selectedType),
  );
  if (
    selected &&
    !types.includes(selected) &&
    types.length &&
    confidence >= 65
  ) {
    throw new Error(
      `This picture appears to show a ${types[0]}, but ${selected} is selected. Choose the matching ID type or replace the picture.`,
    );
  }
  // Preserve the existing Other option for an administrator to assess. These
  // content heuristics do not establish whether its issuer is a government.
  const otherHeading =
    /\b(?:IDENTIFICATION|IDENTITY|ID CARD|SOCIAL SECURITY|GSIS|PHILHEALTH|PROFESSIONAL REGULATION|SENIOR CITIZEN|PERSON WITH DISABILITY)\b/.test(
      content,
    );
  if (!types.length && !otherHeading) {
    throw new Error(
      "The picture does not show a recognized government ID heading. Retake the entire ID front with readable text, or choose the correct ID type.",
    );
  }
  if (
    !selected ||
    !types.includes(selected) ||
    !Number.isFinite(confidence) ||
    confidence < 65
  ) {
    return {
      status: "manual_review",
      reason:
        "ID text was detected, but its type or readability needs administrator review.",
    };
  }
  return {
    status: "recognized",
    reason:
      "ID type and printed details detected. Awaiting administrator verification.",
  };
}
