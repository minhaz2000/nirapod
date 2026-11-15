/**
 * Printed-text OCR with tesseract.js in the browser (languages eng + ben). Works offline once cached.
 */
export async function recognisePrinted(image: Blob | string): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker(['eng', 'ben']);
  try {
    const { data } = await worker.recognize(image);
    return data.text;
  } finally {
    await worker.terminate();
  }
}
