/**
 * Normalize Unicode string to NFC form for consistent comparison
 * This fixes issues with Vietnamese characters like "Thuỷ" which can be 
 * represented differently (composed vs decomposed forms)
 */
const normalizeUnicode = (str: string): string => {
  return str.normalize("NFC");
};

/**
 * Remove all diacritics/accents from a string
 * This handles Vietnamese tone mark placement variations like "Hoà" vs "Hòa"
 * by stripping all combining marks after NFD decomposition
 */
const removeDiacritics = (str: string): string => {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

/**
 * Normalize a name by trimming whitespace and collapsing multiple spaces
 * Also normalizes Unicode to NFC form for consistent Vietnamese character handling
 * Example: "  Nguyễn   Văn   An  " -> "Nguyễn Văn An"
 */
export const normalizeName = (name: string): string => {
  return normalizeUnicode(name.trim().replace(/\s+/g, " "));
};

/**
 * Compare two names for equality after normalization
 * First tries exact NFC comparison, then falls back to diacritics-insensitive
 * This handles Vietnamese variations like "Hoà" vs "Hòa", "Thuỷ" vs "Thủy"
 */
export const compareNames = (name1: string, name2: string): boolean => {
  const normalized1 = normalizeName(name1).toLowerCase();
  const normalized2 = normalizeName(name2).toLowerCase();
  // Exact match first
  if (normalized1 === normalized2) return true;
  // Fallback: compare without diacritics for Vietnamese tone mark variations
  return removeDiacritics(normalized1) === removeDiacritics(normalized2);
};

/**
 * Compare two strings for equality (used for student codes, group numbers)
 * Trims whitespace and compares case-insensitively
 */
export const compareStrings = (str1: string, str2: string): boolean => {
  return normalizeUnicode(str1.trim()).toLowerCase() === normalizeUnicode(str2.trim()).toLowerCase();
};

/**
 * Get the last word from a Vietnamese full name for sorting
 * Vietnamese names: "Nguyễn Văn An" → last word is "An" (given name)
 */
export const getLastWord = (name: string): string => {
  const normalized = normalizeName(name);
  const parts = normalized.split(" ");
  return parts[parts.length - 1] || normalized;
};

/**
 * Sort students by last word in name (Vietnamese given name), then by full name
 */
export const sortByLastName = <T extends { name: string }>(list: T[]): T[] => {
  return [...list].sort((a, b) => {
    const lastA = getLastWord(a.name).toLowerCase();
    const lastB = getLastWord(b.name).toLowerCase();
    const cmp = lastA.localeCompare(lastB, "vi");
    if (cmp !== 0) return cmp;
    return a.name.localeCompare(b.name, "vi");
  });
};
