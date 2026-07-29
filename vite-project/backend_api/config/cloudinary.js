import { v2 as cloudinary } from "cloudinary";

let configured = false;

// Checked lazily (inside a request), not at import time — unlike mailer.js,
// this module is imported by route files that have nothing to do with image
// uploads (via the controller chain), so a missing key here must not crash
// the whole server. Callers see a clean thrown error they can turn into a 503.
export const assertCloudinaryConfigured = () => {
  const required = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"];
  const missing = required.filter((v) => !process.env[v]);
  if (missing.length) {
    throw new Error(`Missing Cloudinary env vars: ${missing.join(", ")}`);
  }

  if (!configured) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
    configured = true;
  }
};

export default cloudinary;
