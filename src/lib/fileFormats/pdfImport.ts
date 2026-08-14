// PDF 文本抽取：pdfjs-dist legacy 构建，逐页取 getTextContent 拼为纯文本。

import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import type { TextItem } from "pdfjs-dist/types/src/display/api";

const workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();

let workerConfigured = false;
function ensureWorker() {
  if (!workerConfigured) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
    workerConfigured = true;
  }
}

/** 从 base64 字符串加载 PDF 并抽取纯文本（每行一个段落，供 textToDoc 合并）。 */
export async function pdfToText(base64: string): Promise<string> {
  ensureWorker();
  const data = atob(base64);
  const bytes = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i);
  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  try {
    const doc = await loadingTask.promise;
    const parts: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();
      let text = "";
      for (const item of textContent.items) {
        const isTextItem = "hasEOL" in item;
        const str = isTextItem ? (item as TextItem).str : "";
        if (!str) continue;
        // 同一行内的文本项没有换行标记；hasEOL 表示该项后是换行
        if (isTextItem && (item as TextItem).hasEOL) text += str + "\n";
        else text += str;
      }
      parts.push(text);
    }
    // 压缩连续空行（文本型 PDF 常见页内/页间空白）
    return parts.join("\n").replace(/\n{3,}/g, "\n\n");
  } finally {
    loadingTask.destroy().catch(() => {
      /* 忽略销毁失败 */
    });
  }
}
