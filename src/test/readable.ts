/**
 * What a person reads on a rendered screen, for the L1 English-output
 * snapshots: lines of text and the labels a screen reader announces
 * (aria-label, placeholder, title, alt), in document order. Class names are
 * left out on purpose, because RTL-readiness swaps left/right for start/end
 * without changing anything an English reader sees.
 */

const ATTRS = ["aria-label", "placeholder", "title", "alt"];
// Text inside these runs on with the text around it, as a reader sees it, so
// "Round {n} of {total}" reads the same whether React renders it as one text
// node or five.
const INLINE = new Set(["span", "a", "code", "strong", "em", "b", "i", "small"]);

export function readable(root: Element): string {
  let out = "";
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      out += node.textContent ?? "";
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    const block = !INLINE.has(tag);
    if (block) out += "\n";
    for (const name of ATTRS) {
      const value = el.getAttribute(name);
      if (value) out += `\n[${name}] ${value}\n`;
    }
    // A QR code's paths are not words.
    if (tag !== "svg") el.childNodes.forEach(walk);
    if (block) out += "\n";
  };
  walk(root);
  return out
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (i) => [...items.keys()][i] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  };
}
