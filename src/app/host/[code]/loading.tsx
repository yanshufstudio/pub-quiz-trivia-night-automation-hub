// Shown while the host page checks the sign-in and streams in. Dark, like the
// desk it stands in for — see .stage-surface in globals.css.
export default function Loading() {
  return (
    <div className="stage-surface flex min-h-dvh items-center justify-center bg-stage text-stage-muted">
      Loading host desk…
    </div>
  );
}
