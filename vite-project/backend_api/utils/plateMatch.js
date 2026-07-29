// OCR output on plates is rarely pixel-perfect, so both sides of a comparison
// go through the same normalization: uppercase, strip anything but letters/digits.
export const normalizePlate = (text = "") =>
  text.toUpperCase().replace(/[^A-Z0-9]/g, "");
