// AI 相关设置（占位，v0.7 提供）：分组整体灰置，不可导航。

/** AI 占位页：v0.7 接入模型配置后替换 */
export function AiSettingsPlaceholder() {
  return (
    <div className="flex max-w-md flex-col gap-2 rounded-xl border border-dashed border-line/70 bg-panel-3/20 px-5 py-6 text-center">
      <p className="text-sm text-fg-muted">AI 协作能力（润色、扩写、续写…）将在 v0.7 提供。</p>
      <p className="text-xs text-fg-muted/60">届时可在此配置模型、密钥与默认行为。</p>
    </div>
  );
}
