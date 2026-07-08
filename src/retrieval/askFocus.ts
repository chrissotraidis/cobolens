export function shouldSyncAskFocus(question: string) {
  return !/\b(codebase\s+overview|overview\s+of\s+(?:this\s+)?codebase|where\s+should\s+i\s+start|what\s+should\s+i\s+inspect\s+first|inspect\s+first|start(?:ing)?\s+point|entry\s+point|entry\s+points|what\s+is\s+(?:in\s+)?this\s+codebase|how\s+is\s+(?:this\s+)?codebase\s+structured)\b/i.test(
    question,
  );
}
