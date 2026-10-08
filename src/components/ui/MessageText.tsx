// Render document-derived text as React nodes; never interpret it as HTML.
export function MessageText({ text }: { text: string }) {
  return <div className="whitespace-pre-wrap break-words">{text.split(/(\*\*[\s\S]*?\*\*)/g).map((part, index) => part.startsWith('**') && part.endsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong> : part)}</div>;
}
