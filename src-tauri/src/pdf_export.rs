//! 图片型 PDF 导出（Rust 后端）。
//!
//! 前端把章节正文按编辑器渲染效果逐页截成 PNG（html-to-image，见
//! src/lib/fileFormats/pdfRender.ts），这里把整页 PNG 按同 dpi 嵌入 A4 页。

use std::fs;
use std::path::Path;

use printpdf::{
    ImageOptimizationOptions, Mm, Op, PdfDocument, PdfPage, PdfSaveOptions, Pt, RawImage,
    XObjectTransform,
};

/// printpdf 0.8 的 `PdfSaveOptions::default()` 默认开启图像优化：超过 2MB 的位图会被
/// 缩小后再嵌入，但放置变换仍按原始像素数换算（px × 72/dpi），导致高分辨率整页图被
/// 压缩后拉伸铺满页面，文字明显发虚。导出整页图时须关闭降采样（max_image_size: None），
/// 只保留 Flate 无损压缩（否则 288dpi 整页 RGB 裸数据约 24MB/页）。
fn save_options() -> PdfSaveOptions {
    let mut opts = PdfSaveOptions::default();
    opts.image_optimization = Some(ImageOptimizationOptions {
        max_image_size: None,
        ..ImageOptimizationOptions::default()
    });
    opts
}
use base64::Engine as _;

/// A4 页面尺寸（mm）
const PAGE_W_MM: f32 = 210.0;
const PAGE_H_MM: f32 = 297.0;

/// 图片型 PDF 导出的负载：每页由前端 canvas 渲染成 PNG base64，Rust 侧整页嵌入。
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImagePdfPayload {
    pub title: String,
    /// 前端渲染像素密度（canvas px = pt × dpi/72），决定图片嵌入后的物理尺寸
    pub dpi: f32,
    #[serde(default)]
    pub pages: Vec<String>,
}

/// 导出图片型 PDF：把前端渲染好的整页 PNG 依次铺满 A4 页。
/// 图片打印尺寸由 XObjectTransform.dpi 换算（px × 72/dpi = pt），前端用同 dpi 渲染即精确铺满。
#[tauri::command]
pub fn export_image_pdf(payload: ImagePdfPayload, output_path: String) -> Result<(), String> {
    let mut warnings = Vec::new();
    let mut doc = PdfDocument::new(&payload.title);

    for (i, page_b64) in payload.pages.iter().enumerate() {
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(page_b64)
            .map_err(|e| format!("第 {} 页图片解码失败：{e}", i + 1))?;
        let image = RawImage::decode_from_bytes(&bytes, &mut warnings)
            .map_err(|e| format!("第 {} 页图片解析失败：{e}", i + 1))?;
        let id = doc.add_image(&image);
        // dpi 与前端一致 → 图片 pt 尺寸 = px × 72/dpi = A4 尺寸，铺满整页
        let transform = XObjectTransform {
            dpi: Some(payload.dpi),
            translate_x: Some(Pt(0.0)),
            translate_y: Some(Pt(0.0)),
            ..Default::default()
        };
        let ops = vec![Op::UseXobject { id, transform }];
        doc.with_pages(vec![PdfPage::new(Mm(PAGE_W_MM), Mm(PAGE_H_MM), ops)]);
    }

    let bytes = doc.save(&save_options(), &mut warnings);

    if let Some(parent) = Path::new(&output_path).parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建输出目录失败：{e}"))?;
    }
    fs::write(&output_path, bytes).map_err(|e| format!("写入 PDF 失败：{e}"))
}
