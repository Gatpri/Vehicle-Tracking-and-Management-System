import "./BrandLogo.css";

/**
 * The VeriTrack wordmark — the square "V" tile plus the name.
 *
 * Lifted out of AppLayout so the auth screens and the admin header show the
 * identical mark instead of each hand-rolling its own ("PracticeProject",
 * "8th-Sem-Project"). `tone` picks the palette: the default reads on a light
 * surface, "light" on the dark navy headers.
 */
function BrandLogo({
  tone = "dark",
  size = "md",
}: {
  tone?: "dark" | "light";
  size?: "md" | "lg";
}) {
  return (
    <span className={`brand-logo brand-logo-${tone} brand-logo-${size}`}>
      <span className="brand-logo-mark">V</span>
      <span className="brand-logo-name">VeriTrack</span>
    </span>
  );
}

export default BrandLogo;
