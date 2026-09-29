import type { ElementType } from "react";

/**
 * A question's text, the same way on the host desk, the phones and the TV.
 *
 * `dir="auto"` lets the browser take the direction from the text itself, so a
 * Hebrew or Arabic question lays out right to left inside an English page
 * without anything else knowing what language it is in. Every piece of text a
 * pack or a team supplies — questions, options, answers, team names — carries
 * it; this component is where questions get it.
 */
export function QuestionText({
  text,
  as: Tag = "p",
  className = "",
}: {
  text: string;
  as?: ElementType;
  className?: string;
}) {
  return (
    <Tag dir="auto" className={`whitespace-pre-line break-words ${className}`}>
      {text}
    </Tag>
  );
}
