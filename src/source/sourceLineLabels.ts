export function sourceLineLabel(lines: [number, number] | undefined, fallbackLine = 1) {
  const start = lines?.[0] ?? fallbackLine;
  const end = lines?.[1] ?? start;
  return end > start ? `lines ${start}-${end}` : `line ${start}`;
}

export function sourceLineClassName(selectedRangeLine: boolean, focusedLine: boolean, citationLine: boolean) {
  return [
    "source-line",
    selectedRangeLine ? "is-selected-range" : "",
    focusedLine ? "is-highlighted" : "",
    citationLine ? "is-citation-line" : "",
  ].filter(Boolean).join(" ");
}

export function sourceLineMarker(selectedRangeLine: boolean, focusedLine: boolean, citationLine: boolean) {
  if (citationLine) return "C";
  if (focusedLine) return ">";
  if (selectedRangeLine) return "|";
  return " ";
}

export function sourceLineStateLabel(selectedRangeLine: boolean, focusedLine: boolean, citationLine: boolean) {
  const states = [];
  if (citationLine) states.push("focused citation");
  else if (focusedLine) states.push("focused line");
  if (selectedRangeLine) states.push("selected symbol range");
  return states.length ? `, ${states.join(", ")}` : "";
}
