/**
 * Every lesson's `objectives[0]` (packages/content) is authored as a
 * standalone, capitalized, unpunctuated phrase — "Identify the board's
 * orientation..." — because it's also meant to read as its own bullet
 * elsewhere. LessonRunner.tsx composes it into one sentence, "By the end
 * of this lesson, you'll be able to <objective>." — grammatically that
 * needs a lowercase verb after "to" and a full stop, which no content
 * file provides. Normalizing here (once, at render time) fixes every
 * lesson's objective sentence at once, rather than hand-editing ~20
 * content files into two different casings for the same text.
 */
export function formatObjectiveSentence(objective: string): string {
  const trimmed = objective.trim();
  if (trimmed.length === 0) return trimmed;
  const lowercasedFirst = trimmed[0].toLowerCase() + trimmed.slice(1);
  return /[.!?]$/.test(lowercasedFirst) ? lowercasedFirst : `${lowercasedFirst}.`;
}
