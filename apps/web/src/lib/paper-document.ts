import { apiErrorMessage, apiFetch } from '@/services/api';

export async function downloadPaperDocument(path: string, name: string) {
  const response = await apiFetch(path);
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response));
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/** Open the official PDF in a print dialog (attestation / certificate / receipt). */
export async function printPaperDocument(path: string) {
  const response = await apiFetch(path);
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response));
  }
  const url = URL.createObjectURL(await response.blob());
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.src = url;
  document.body.appendChild(frame);

  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('Print preview timed out'));
    }, 15000);
    function cleanup() {
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
      frame.remove();
    }
    frame.onload = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch (error) {
        cleanup();
        reject(error instanceof Error ? error : new Error('Print failed'));
        return;
      }
      window.setTimeout(() => {
        cleanup();
        resolve();
      }, 1000);
    };
  });
}
