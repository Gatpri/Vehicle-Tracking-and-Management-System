import multer from "multer";

const imageOnly = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image uploads are allowed"));
  }
};

// Memory storage: buffers go straight to Cloudinary and the ANPR service, no
// temp files to clean up, works the same regardless of deploy target.
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: imageOnly,
});

// Voice notes on parts quotes. Browsers hand back audio/webm or audio/mp4
// depending on the platform, so the filter checks the family rather than an
// exact type. 10MB covers a couple of minutes of speech comfortably.
export const uploadAudio = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("audio/")) cb(null, true);
    else cb(new Error("Only audio uploads are allowed"));
  },
});
