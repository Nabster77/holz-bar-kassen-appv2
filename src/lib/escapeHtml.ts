// Escapes text that is interpolated into generated HTML documents (journal and
// day-close exports). Without this, free text such as an article name or the
// reason for a cash entry could inject markup or script into the export, which
// is rendered in the app's own origin.
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
