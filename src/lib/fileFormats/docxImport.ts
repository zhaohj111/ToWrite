// DOCX 文本抽取：mammoth.convertToHtml 保留标题语义，再经 htmlToDoc 转章节文档。
// 旧版二进制 .doc 无法在浏览器侧解析（officeparser 等库均不支持），抛出明确错误。

import * as mammoth from "mammoth/mammoth.browser";

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** .docx → 章节文档（保留标题），失败抛出带说明的错误。 */
export async function docxToHtml(base64: string): Promise<string> {
  const arrayBuffer = base64ToArrayBuffer(base64);
  const result = await mammoth.convertToHtml({ arrayBuffer });
  return result.value;
}

/** .doc（旧版二进制）→ 纯文本。浏览器侧无可靠解析库，提示用户转存 .docx。 */
export async function docToText(_base64: string): Promise<string> {
  throw new Error(
    "暂不支持旧版二进制 .doc 格式。请先用 Word 另存为 .docx，或直接导入为 Markdown/TXT。"
  );
}
