import axios from "axios";

const JPEG_SOI = Buffer.from([0xff, 0xd8]);
const JPEG_EOI = Buffer.from([0xff, 0xd9]);
// Safety cap so a misbehaving stream can't grow the buffer unbounded while
// we wait for a JPEG end marker that never arrives.
const MAX_BYTES = 4 * 1024 * 1024;

// Pulls a single JPEG frame from a camera URL. Works uniformly for both a
// plain snapshot endpoint (one JPEG, connection closes) and a continuous
// MJPEG stream (multipart/x-mixed-replace) by scanning incoming bytes for
// a JPEG start/end marker pair and aborting the connection as soon as one
// full frame is found — we never need more than that per poll.
export const fetchFrame = (url, timeoutMs = 8000) =>
  new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      fn(arg);
    };

    axios
      .get(url, { responseType: "stream", timeout: timeoutMs })
      .then((response) => {
        const stream = response.data;
        let chunks = [];
        let total = 0;

        const cleanup = () => stream.destroy();

        stream.on("data", (chunk) => {
          chunks.push(chunk);
          total += chunk.length;
          if (total > MAX_BYTES) {
            cleanup();
            finish(reject, new Error("Stream exceeded size limit before a JPEG frame was found"));
            return;
          }
          const buf = Buffer.concat(chunks);
          const start = buf.indexOf(JPEG_SOI);
          if (start === -1) return;
          const end = buf.indexOf(JPEG_EOI, start + 2);
          if (end === -1) return;
          cleanup();
          finish(resolve, buf.subarray(start, end + 2));
        });
        stream.on("end", () => {
          const buf = Buffer.concat(chunks);
          const start = buf.indexOf(JPEG_SOI);
          const end = start === -1 ? -1 : buf.indexOf(JPEG_EOI, start + 2);
          if (start !== -1 && end !== -1) finish(resolve, buf.subarray(start, end + 2));
          else finish(reject, new Error("No JPEG frame found before the stream ended"));
        });
        stream.on("error", (err) => finish(reject, err));
      })
      .catch((err) => finish(reject, err));
  });
