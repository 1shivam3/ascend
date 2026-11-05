import React from 'react';

/**
 * CoachMarkdown — markdown-LITE renderer for coach chat replies
 * (Coach AI Actions, Slice B).
 *
 * Deliberately tiny grammar: paragraphs, **bold**, *italic*,
 * "- "/"• " bullet lists, "1. " numbered lists, "## "/"### " small
 * headings, and single line breaks inside a paragraph. EVERYTHING is
 * rendered as React text nodes — no dangerouslySetInnerHTML, no HTML
 * parsing, no new dependency — so model output cannot inject markup:
 * a "<script>" in a reply is just characters on screen. Anything the
 * grammar does not recognize renders as literal text.
 */

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let buf = '';
  let i = 0;
  let k = 0;
  const flush = () => {
    if (buf.length > 0) {
      nodes.push(buf);
      buf = '';
    }
  };
  while (i < text.length) {
    if (text.startsWith('**', i)) {
      const end = text.indexOf('**', i + 2);
      if (end > i + 2) {
        flush();
        nodes.push(
          <strong key={`${keyPrefix}-b${k++}`}>
            {renderInline(text.slice(i + 2, end), `${keyPrefix}-b${k}`)}
          </strong>
        );
        i = end + 2;
        continue;
      }
      // No closing ** — the pair is literal text, NOT two italic
      // markers (falling through would italicize whatever happens
      // to sit between this ** and some later single *).
      buf += '**';
      i += 2;
      continue;
    }
    if (text[i] === '*') {
      const end = text.indexOf('*', i + 1);
      if (end > i + 1) {
        flush();
        nodes.push(
          <em key={`${keyPrefix}-i${k++}`}>
            {renderInline(text.slice(i + 1, end), `${keyPrefix}-i${k}`)}
          </em>
        );
        i = end + 1;
        continue;
      }
    }
    buf += text[i];
    i += 1;
  }
  flush();
  return nodes;
}

const BULLET_RE = /^[-•]\s+(.*)$/;
const NUMBER_RE = /^\d+[.)]\s+(.*)$/;

function renderBlock(block: string, key: number): React.ReactNode {
  const lines = block.split('\n').map((l) => l.trim());
  const first = lines[0] ?? '';

  if (lines.length === 1 && first.startsWith('### ')) {
    return (
      <h5 key={key} className="text-sm font-bold text-text-primary">
        {renderInline(first.slice(4), `h${key}`)}
      </h5>
    );
  }
  if (lines.length === 1 && first.startsWith('## ')) {
    return (
      <h4 key={key} className="text-sm font-bold text-text-primary">
        {renderInline(first.slice(3), `h${key}`)}
      </h4>
    );
  }
  if (lines.length > 0 && lines.every((l) => BULLET_RE.test(l))) {
    return (
      <ul key={key} className="list-disc list-inside space-y-0.5 text-sm text-text-primary">
        {lines.map((l, li) => (
          <li key={li}>{renderInline(BULLET_RE.exec(l)?.[1] ?? l, `u${key}-${li}`)}</li>
        ))}
      </ul>
    );
  }
  if (lines.length > 0 && lines.every((l) => NUMBER_RE.test(l))) {
    return (
      <ol key={key} className="list-decimal list-inside space-y-0.5 text-sm text-text-primary">
        {lines.map((l, li) => (
          <li key={li}>{renderInline(NUMBER_RE.exec(l)?.[1] ?? l, `o${key}-${li}`)}</li>
        ))}
      </ol>
    );
  }
  return (
    <p key={key} className="text-sm text-text-primary">
      {lines.map((l, li) => (
        <React.Fragment key={li}>
          {li > 0 && <br />}
          {renderInline(l, `p${key}-${li}`)}
        </React.Fragment>
      ))}
    </p>
  );
}

export default function CoachMarkdown({ text }: { text: string }) {
  const blocks = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
  if (blocks.length === 0) return null;
  return <div className="space-y-2">{blocks.map((b, i) => renderBlock(b, i))}</div>;
}
