// 应用 > 存储与备份：工程存储目录（只读）+ 数据迁移 + 自动备份（占位，v1.0）。
// 迁移：工程数据可整体移动到其他磁盘；C 盘应用数据处仅保留数据地址指针。

import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { SettingToggle } from "@/components/settings/controls";
import { cn } from "@/lib/cn";
import { getDataPointerDir, migrateData } from "@/lib/tauri";
import { useProjectStore } from "@/stores/projectStore";

/** 工程存储目录（只读展示，来自后端 projectsDir） */
export function StorageDir() {
  const projectsDir = useProjectStore((s) => s.projectsDir);
  return (
    <div className="flex h-9 min-w-72 max-w-md items-center rounded-lg border border-line bg-panel-3/40 px-3 font-mono text-[13px] text-fg-muted">
      {projectsDir ?? "（正在获取存储目录…）"}
    </div>
  );
}

/** 数据迁移：把工程目录整体移到所选位置，C 盘应用数据处仅保留地址指针 */
export function DataMigration() {
  const [busy, setBusy] = useState(false);
  const [pointer, setPointer] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    void getDataPointerDir()
      .then((d) => alive && setPointer(d))
      .catch(() => alive && setPointer(null));
    return () => {
      alive = false;
    };
  }, []);

  const migrate = async () => {
    const dir = await open({ directory: true, multiple: false });
    if (typeof dir !== "string") return;
    setBusy(true);
    setMessage(null);
    try {
      const next = await migrateData(dir);
      // 刷新工程列表与存储目录显示（此后读写均指向新位置）
      await useProjectStore.getState().loadProjects();
      setMessage({ ok: true, text: `数据已迁移至 ${next}` });
    } catch (e) {
      setMessage({ ok: false, text: `迁移失败：${String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex w-full flex-col items-start gap-2">
      <Button variant="secondary" size="sm" onClick={migrate} disabled={busy}>
        {busy ? "正在迁移…" : "选择新位置并迁移…"}
      </Button>
      {message && (
        <p
          className={cn(
            "max-w-lg break-all text-left text-[12px]",
            message.ok ? "text-fg-muted" : "text-danger",
          )}
        >
          {message.text}
        </p>
      )}
      {pointer && (
        <p className="max-w-lg break-all text-left text-[12px] text-fg-muted">
          地址指针（C 盘应用数据）：{pointer}
        </p>
      )}
    </div>
  );
}

/** 自动备份（占位禁用，v1.0 提供） */
export function AutoBackup() {
  const [on] = useState(false);
  return <SettingToggle checked={on} onChange={() => {}} disabled />;
}
