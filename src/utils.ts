export function sanitizeAccessoryName(name: string): string {
  // Remove any non-alphanumeric characters except spaces and apostrophes
  let sanitized = name.replace(/[^a-zA-Z0-9 ']/g, "");

  // Trim leading and trailing spaces
  sanitized = sanitized.trim();

  // Ensure it starts and ends with an alphanumeric character
  sanitized = sanitized.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, "");

  // If the name is empty after sanitization, use a default name
  if (sanitized.length === 0) {
    sanitized = "Roku TV";
  }

  return sanitized;
}
