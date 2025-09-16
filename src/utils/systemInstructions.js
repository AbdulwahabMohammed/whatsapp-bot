const DEFAULT_SYSTEM_INSTRUCTIONS = 'رد فقط باستخدام البيانات المقدمة من الملفات المرجعية الخاصة بالمنشأة.';
const SYSTEM_INSTRUCTIONS_FILTER_REASON = 'system_instructions_match';

function normalizeSystemText (text) {
  if (!text) {
    return '';
  }
  return String(text)
    .replace(/^\uFEFF/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function getAppliedInstructions (instructions) {
  const normalized = normalizeSystemText(instructions);
  if (normalized) {
    return instructions;
  }
  return DEFAULT_SYSTEM_INSTRUCTIONS;
}

function matchesSystemInstructions (candidate, instructions) {
  const normalizedCandidate = normalizeSystemText(candidate);
  if (!normalizedCandidate) {
    return false;
  }
  const normalizedInstructions = normalizeSystemText(getAppliedInstructions(instructions));
  return normalizedCandidate === normalizedInstructions;
}

module.exports = {
  DEFAULT_SYSTEM_INSTRUCTIONS,
  getAppliedInstructions,
  SYSTEM_INSTRUCTIONS_FILTER_REASON,
  matchesSystemInstructions,
  normalizeSystemText
};
