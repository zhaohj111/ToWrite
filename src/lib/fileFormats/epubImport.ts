// EPUB 文本抽取：jszip 解包 → container.xml 定位 content.opf → 按 spine 顺序拼接各 XHTML 文本。

import JSZip from "jszip";

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** 从 OPF 文件解析 (manifest 的 href 归一化路径, spine 的 idref 顺序)。 */
function parseOpf(xml: string): { hrefById: Map<string, string>; spine: string[] } {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const hrefById = new Map<string, string>();
  for (const item of Array.from(doc.getElementsByTagName("item"))) {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (id && href) hrefById.set(id, href);
  }
  const spine: string[] = [];
  for (const ref of Array.from(doc.getElementsByTagName("itemref"))) {
    const idref = ref.getAttribute("idref");
    if (idref) spine.push(idref);
  }
  return { hrefById, spine };
}

/** 在 ZIP 内解析相对路径（处理 ../ 与反斜杠）。 */
function resolveZipPath(baseDir: string, rel: string): string {
  const parts = baseDir.split("/").filter(Boolean);
  for (const seg of rel.replace(/\\/g, "/").split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

/** base64 的 EPUB → 纯文本（按阅读顺序）。 */
export async function epubToText(base64: string): Promise<string> {
  const zip = await JSZip.loadAsync(base64ToUint8(base64));
  const containerXml = await zip.file("META-INF/container.xml")?.async("string");
  if (!containerXml) throw new Error("EPUB 缺少 META-INF/container.xml，不是有效的 EPUB 文件。");

  const containerDoc = new DOMParser().parseFromString(containerXml, "application/xml");
  const rootfile = containerDoc.querySelector("rootfile");
  const opfPath = rootfile?.getAttribute("full-path");
  if (!opfPath) throw new Error("EPUB container.xml 中未找到 content.opf。");

  const opf = await zip.file(opfPath)?.async("string");
  if (!opf) throw new Error(`EPUB 缺少 OPF 文件：${opfPath}`);

  const { hrefById, spine } = parseOpf(opf);
  const opfDir = opfPath.split("/").slice(0, -1).join("/");

  const parts: string[] = [];
  for (const idref of spine) {
    const href = hrefById.get(idref);
    if (!href) continue;
    const resolved = resolveZipPath(opfDir, href);
    const content = await zip.file(resolved)?.async("string");
    if (!content) continue;
    const body = new DOMParser().parseFromString(content, "text/html").body;
    const text = (body.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text) parts.push(text);
  }

  const joined = parts.join("\n\n");
  if (!joined.trim()) throw new Error("EPUB 未抽取到可用的正文内容。");
  return joined;
}
