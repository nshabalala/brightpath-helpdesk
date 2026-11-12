export function formatResult(r) {
  const lines = [r.answer];
  if (r.sources.length) {
    lines.push('', 'Source: ' + r.sources.map((s) => `${s.title} (${s.id})`).join('; '));
    for (const q of r.quotes) lines.push(`  > ${q}`);
  }
  if (r.note) lines.push('', `[${r.note}]`);
  return lines.join('\n');
}
