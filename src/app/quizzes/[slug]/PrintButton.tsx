"use client";

/**
 * Opens the browser's print dialog. The page's print styles (globals.css, the
 * `quiz-sheet` rules) leave only the heading, the rounds and the answers, so
 * this is the whole of "print these rounds". It is itself `print-chrome`, so it
 * never comes out of the printer.
 */
export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print-chrome mt-6 inline-flex min-h-12 items-center rounded-xl border border-line bg-white px-4 text-sm font-semibold text-foreground transition-colors hover:border-amber hover:text-amber"
    >
      {label}
    </button>
  );
}
