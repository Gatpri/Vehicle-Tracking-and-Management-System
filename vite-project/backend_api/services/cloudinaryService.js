import cloudinary, { assertCloudinaryConfigured } from "../config/cloudinary.js";

// Uploads a buffer (from multer's memoryStorage) to Cloudinary and returns
// the resulting secure_url. Throws if Cloudinary isn't configured yet —
// callers are expected to turn that into a 503, not let it crash the server.
export const uploadImage = (buffer, folder = "vehicle-platform") => {
  assertCloudinaryConfigured();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image" },
      (err, result) => {
        if (err) return reject(err);
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
};
