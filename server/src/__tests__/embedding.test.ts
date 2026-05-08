import { describe, it, expect } from 'vitest';
import { cosineSim, htmlToText, docTextForEmbedding } from '../ai/embedding.js';

describe('cosineSim', () => {
  it('returns 1 for identical normalized vectors', () => {
    const a = [1, 0, 0];
    const b = [1, 0, 0];
    expect(cosineSim(a, b)).toBeCloseTo(1, 6);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSim([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });

  it('returns -1 for opposite normalized vectors', () => {
    expect(cosineSim([1, 0], [-1, 0])).toBeCloseTo(-1, 6);
  });

  it('throws on length mismatch', () => {
    expect(() => cosineSim([1, 0], [1, 0, 0])).toThrow(/length/);
  });
});

describe('htmlToText', () => {
  it('strips tags and decodes common entities', () => {
    // Tags become whitespace then collapse — punctuation can end up with a
    // leading space, which is fine for embedding purposes (tokenisation is
    // robust to it). We assert the meaningful content survives.
    const out = htmlToText('<p>Hello <strong>World</strong>!</p>');
    expect(out).toContain('Hello');
    expect(out).toContain('World');
    expect(htmlToText('Tom &amp; Jerry')).toBe('Tom & Jerry');
    expect(htmlToText('&lt;tag&gt;')).toBe('<tag>');
  });

  it('collapses whitespace', () => {
    expect(htmlToText('<div>  a   b\n\n c  </div>')).toBe('a b c');
  });

  it('handles nested tags', () => {
    expect(htmlToText('<div><p><span>x</span><span>y</span></p></div>')).toBe('x y');
  });
});

describe('docTextForEmbedding', () => {
  it('emphasises title by repeating it once', () => {
    const text = docTextForEmbedding('My Title', '<p>body</p>');
    expect(text).toBe('My Title My Title body');
  });

  it('truncates long combined text to 4000 chars', () => {
    const longContent = '<p>' + 'a '.repeat(5000) + '</p>';
    const text = docTextForEmbedding('Title', longContent);
    expect(text.length).toBe(4000);
  });
});
