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
