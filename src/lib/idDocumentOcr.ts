import { inspectIdText, type IdDocumentCheck } from "./idDocument";

// All code and language data come from this deployment. ID pixels and extracted
// text stay in memory on the device; neither is sent to an OCR service or logged.
export async function checkIdDocument(
  image: HTMLImageElement,
  idType: string,
  signal: AbortSignal,
  onProgress: (message: string) => void,
): Promise<IdDocumentCheck> {
  signal.throwIfAborted();
  const canvas = document.createElement("canvas");
  const scale = Math.min(
    1,
    2000 / Math.max(image.naturalWidth, image.naturalHeight),
  );
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error("This device cannot read ID images. Try another browser.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value
          ? resolve(value)
          : reject(
              new Error(
                "The ID picture could not be read. Retake it and retry.",
              ),
            ),
      "image/png",
    ),
  );
  signal.throwIfAborted();
  const worker = new Worker(
    new URL("./idDocument.worker.ts", import.meta.url),
    { type: "module" },
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort = () => {};
  try {
    const data = await new Promise<{ text: string; confidence: number }>(
      (resolve, reject) => {
        abort = () =>
          reject(new DOMException("ID check cancelled.", "AbortError"));
        timer = setTimeout(
          () =>
            reject(
              new Error(
                "The ID text check took too long. Check your connection and retry with a clear photo.",
              ),
            ),
          90000,
        );
        signal.addEventListener("abort", abort, { once: true });
        worker.onmessage = (event) => {
          if (event.data.type === "progress") {
            if (!signal.aborted) onProgress(event.data.message);
          } else if (event.data.type === "result") resolve(event.data);
          else if (event.data.type === "error")
            reject(
              new Error(
                "The ID checker could not load or read this photo. Check your connection and retry.",
              ),
            );
        };
        worker.onerror = () =>
          reject(
            new Error(
              "The ID checker could not load. Check your connection and retry.",
            ),
          );
        worker.postMessage({
          blob,
          base: new URL(`${import.meta.env.BASE_URL}ocr/v7/`, location.href)
            .href,
        });
      },
    );
    signal.throwIfAborted();
    return inspectIdText(data.text, data.confidence, idType);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
    worker.terminate();
  }
}
