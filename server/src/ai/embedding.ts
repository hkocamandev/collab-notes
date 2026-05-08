// Local embedding service using transformers.js + the all-MiniLM-L6-v2
// sentence transformer (~22 MB ONNX, 384-dim, normalized output). Pipeline
// is lazy-initialised on first use; subsequent calls reuse the loaded model.
//
// We deliberately avoid hosted AI providers here so the Ask AI feature works
// fully offline once the model is cached locally (Docker image bakes it in
// at build time — see server/Dockerfile).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pipelinePromise: Promise<any> | null = null;

async function getEmbedder() {
  if (!pipelinePromise) {
    // Dynamic import keeps this dep out of the hot start path of the API
    // server (transformers.js pulls in ~50 MB of JS) and lets tests mock
    // the module easily.
    pipelinePromise = import('@xenova/transformers').then(t =>
      t.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2'),
    );
  }
  return pipelinePromise;
}

// Compute a 384-dim normalized embedding for `text`. With normalize=true the
// resulting vector has unit length, so cosine similarity reduces to a dot
// product (one fewer sqrt per comparison).
export async function embed(text: string): Promise<number[]> {
  const embedder = await getEmbedder();
  const output = await embedder(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data as Float32Array);
}

// Cosine similarity between two equal-length vectors. Both inputs are assumed
// to be already L2-normalized (which they are if produced by `embed`), so a
// dot product is sufficient.
export function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`vector length mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
  }
  return dot;
}

// Quick HTML → plaintext for content embedding. Tiptap stores rich HTML;
// we want only the text signal. Strip tags, decode common entities, collapse
// whitespace. Good enough for embedding — exact HTML structure is noise here.
export function htmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Combine title + body into a single string for embedding. Title is repeated
// once for slight emphasis (a one-word query that matches the title should
// rank above body matches).
export function docTextForEmbedding(title: string, content: string): string {
  return `${title} ${title} ${htmlToText(content)}`.slice(0, 4000);
}
