import multer from "multer";

const imageOnly = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image uploads are allowed"));
  }
};

// Memory storage: buffers go straight to Cloudinary/Tesseract, no temp files
// to clean up, works the same regardless of deploy target.
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: imageOnly,
});
