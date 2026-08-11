// 「有更新」红色角标：自动/手动检查发现新版本时，在设置图标右上角显示小圆点。
// 需要放在设置了 `relative` 的父元素内定位。

import { useUpdateStore } from "@/stores/updateStore";

export function UpdateBadge() {
  const available = useUpdateStore((s) => s.available);
  if (!available) return null;
  return (
    <span
      className="absolute -right-1 -top-1 size-2 rounded-full bg-danger ring-2 ring-bg"
      title="有新版本可用"
    />
  );
}
