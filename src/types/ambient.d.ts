// 第三方库无类型声明时的局部声明（仅覆盖本项目使用的 API）。

declare module "mammoth/mammoth.browser" {
  export interface MammothResult {
    value: string;
    messages: unknown[];
  }
  export interface ConvertOptions {
    arrayBuffer?: ArrayBuffer;
    buffer?: ArrayBuffer;
    [key: string]: unknown;
  }
  export function convertToHtml(input: ConvertOptions): Promise<MammothResult>;
  export function extractRawText(input: ConvertOptions): Promise<MammothResult>;
  export function convertToMarkdown(input: ConvertOptions): Promise<MammothResult>;
}
