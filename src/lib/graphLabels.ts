// Mainframe acronyms keep their capitals; everything else is sentence case,
// matching the legend ("JCL step", "CICS command", "DB2 table").
const ACRONYMS = new Set(["cics", "db2", "dd", "ims", "jcl", "mq", "sql", "vsam"]);

function labelWords(type: string) {
  return type
    .split("-")
    .filter(Boolean)
    .map((part) => (ACRONYMS.has(part.toLowerCase()) ? part.toUpperCase() : part.toLowerCase()));
}

export function nodeTypeLabel(type: string) {
  const words = labelWords(type);
  if (words[0] && !ACRONYMS.has(words[0].toLowerCase())) words[0] = words[0][0].toUpperCase() + words[0].slice(1);
  return words.join(" ");
}

// The analyzer writes structural edges in capitals (COPIES, DECLARES-DD) and
// data-flow edges in lowercase (reads, uses-dd). Display them one way.
export function relationshipLabel(type: string) {
  return labelWords(type).join(" ");
}
