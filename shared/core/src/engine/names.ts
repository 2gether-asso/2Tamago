/** Characters that stand in for letters, so that « h4te » is caught as « hate ». */
const LOOKALIKES: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
  '!': 'i',
};

/**
 * A name as the filter reads it: without accents or capitals, lookalike digits turned into
 * letters, and nothing but letters left (spaces, dots and dashes do not hide a word).
 */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[01345 7@$!]/g, (char) => LOOKALIKES[char] ?? '')
    .replace(/[^a-z]/g, '');
}

/**
 * The first blocked term found in `name` (as the admin wrote it), or `null`. A term matches
 * anywhere in the name once both are normalized: that catches « Mr_Hate » too, and it is why
 * short terms must be chosen with care (« ass » is in « classe »).
 */
export function blockedTerm(name: string, blocked: readonly string[]): string | null {
  const normalized = normalizeName(name);
  for (const term of blocked) {
    const needle = normalizeName(term);
    if (needle.length >= 2 && normalized.includes(needle)) return term;
  }
  return null;
}
