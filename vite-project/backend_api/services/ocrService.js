import { createWorker } from "tesseract.js";

// Tesseract needs no credentials (runs fully offline), so unlike the eSewa/
// Cloudinary services this one is always "configured". The worker is
// expensive to spin up, so it's created once, lazily, and reused across scans.
let workerPromise = null;

const getWorker = () => {
  if (!workerPromise) {
    workerPromise = createWorker("eng");
  }
  return workerPromise;
};

// Reads text out of an image buffer (e.g. a plate photo). Returns the raw
// text and Tesseract's own confidence score (0-100).
export const recognizeText = async (buffer) => {
  const worker = await getWorker();
  const {
    data: { text, confidence },
  } = await worker.recognize(buffer);
  return { text: text.trim(), confidence };
};
