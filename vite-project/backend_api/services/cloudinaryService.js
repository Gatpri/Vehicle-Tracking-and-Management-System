import cloudinary, { assertCloudinaryConfigured } from "../config/cloudinary.js";

// Uploads a buffer (from multer's memoryStorage) to Cloudinary and returns
// the resulting secure_url. Throws if Cloudinary isn't configured yet —
// callers are expected to turn that into a 503, not let it crash the server.
//
// Everything is converted to JPEG on the way in. iPhones shoot HEIC by
// default, and Cloudinary happily stores and serves it as image/heic — which
// no desktop browser can decode, so an <img> pointing at it renders as a
// broken-image icon with a 200 response and nothing in the console to explain
// why. Converting at upload time fixes every consumer at once (vehicle photos,
// plate photos, CCTV frames, workshop logos) and keeps the stored URL usable
// on any client, rather than leaving each <img> to guess.
export const uploadImage = (buffer, folder = "vehicle-platform") => {
  assertCloudinaryConfigured();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image", format: "jpg" },
      (err, result) => {
        if (err) return reject(err);
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
};

// Same, for audio (voice notes on parts quotes). Cloudinary files audio under
// resource_type "video" — there is no separate "audio" type.
export const uploadMedia = (buffer, folder = "vehicle-platform") => {
  assertCloudinaryConfigured();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "video" },
      (err, result) => {
        if (err) return reject(err);
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
};
