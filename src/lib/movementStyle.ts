import { escapeHtml } from '@/lib/escapeHtml';

const styles = {
  cash: { badge: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300', ink: '#166534', fill: '#dcfce7' },
  card: { badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300', ink: '#1e40af', fill: '#dbeafe' },
  deposit: { badge: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300', ink: '#5b21b6', fill: '#ede9fe' },
  withdrawal: { badge: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300', ink: '#991b1b', fill: '#fee2e2' },
  correction: { badge: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300', ink: '#9a3412', fill: '#ffedd5' },
  pfand: { badge: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300', ink: '#115e59', fill: '#ccfbf1' },
};

export function movementStyle(kind: string) {
  if (kind === 'Bareinnahme') return styles.cash;
  if (kind === 'Karteneinnahme') return styles.card;
  if (kind === 'Einlage') return styles.deposit;
  if (kind === 'Korrektur') return styles.correction;
  if (['Pfandausgabe', 'Pfand-Retoure', 'Pfandretoure'].includes(kind)) return styles.pfand;
  return styles.withdrawal;
}

export function movementBadgeHTML(kind: string): string {
  const style = movementStyle(kind);
  return `<span style="background:${style.fill};color:${style.ink};border-radius:4px;padding:2px 5px;font-weight:600">${escapeHtml(kind)}</span>`;
}

export const negativeMoneyClass = 'text-red-600 dark:text-red-400';
const negativePattern = /[-−]\s*\d[\d.,\s\u00a0]*€/g;
function isNonzero(value: string): boolean { return /[1-9]/.test(value); }
export function hasNegativeMoney(value: string): boolean {
  return [...value.matchAll(negativePattern)].some(match => isNonzero(match[0]));
}

/** Color monetary values only, never minus signs in names, dates or labels. */
export function colorNegativeMoney(doc: Document): void {
  const walker = doc.createTreeWalker(doc.body, 4);
  const nodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (!node.parentElement?.closest('script, style, .negative-money') && hasNegativeMoney(node.data)) nodes.push(node);
  }
  for (const node of nodes) {
    const fragment = doc.createDocumentFragment();
    let offset = 0;
    for (const match of node.data.matchAll(negativePattern)) {
      if (!isNonzero(match[0])) continue;
      fragment.append(node.data.slice(offset, match.index));
      const span = doc.createElement('span');
      span.className = 'negative-money';
      span.style.color = '#b91c1c';
      span.textContent = match[0];
      fragment.append(span);
      offset = match.index! + match[0].length;
    }
    fragment.append(node.data.slice(offset));
    node.replaceWith(fragment);
  }
}
