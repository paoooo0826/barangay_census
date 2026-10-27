import { createWorker, PSM } from "tesseract.js";

// The cancellable owner also stops this engine's child worker on close, timeout,
// or navigation, including during asset download and initialization.
self.onmessage = async (event: MessageEvent<{ blob: Blob; base: string }>) => {
  const { blob, base } = event.data;
  let engine: Awaited<ReturnType<typeof createWorker>> | undefined;
  const progress = (message: string) =>
    self.postMessage({ type: "progress", message });
  try {
    progress("Loading the ID text checker…");
    engine = await createWorker("eng", 1, {
      workerPath: `${base}worker.min.js`,
      corePath: base,
      langPath: base,
      workerBlobURL: false,
      logger: (message) => {
        if (message.status === "recognizing text")
          progress(
            `Reading ID details… ${Math.round(message.progress * 100)}%`,
          );
      },
      errorHandler: () => self.postMessage({ type: "error" }),
    });
    await engine.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    const { data } = await engine.recognize(blob, { rotateAuto: true });
    self.postMessage({
      type: "result",
      text: data.text,
      confidence: data.confidence,
    });
  } catch {
    self.postMessage({ type: "error" });
  } finally {
    if (engine) await engine.terminate();
  }
};
