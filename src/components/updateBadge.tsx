// 「有更新」红色角标：自动/手动检查发现新版本时，在设置图标右上角显示小圆点。
// 用法：必须放在「图标」的 relative 容器里（inline-flex 包住图标），
// 不要放在整块按钮上——按钮区域大，红点会跑到按钮矩形角落而不是图标角落。

import { useUpdateStore } from "@/stores/updateStore";

export function UpdateBadge() {
  const available = useUpdateStore((s) => s.available);
  if (!available) return null;
  return (
    <span
      className="absolute -right-1 -top-1 size-2 rounded-full bg-danger"
      title="有新版本可用"
    />
  );
}

/** 内联红点（非绝对定位）：设置导航等行内场景，有更新时在文本后显示 */
export function UpdateDot() {
  const available = useUpdateStore((s) => s.available);
  if (!available) return null;
  return (
    <span
      className="ml-1.5 inline-block size-2 shrink-0 self-center rounded-full bg-danger"
      title="有新版本可用"
    />
  );
}
