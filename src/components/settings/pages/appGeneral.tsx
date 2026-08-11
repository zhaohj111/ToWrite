// 应用 > 通用与启动：启动行为 + 最近工程管理 + 语言（占位）。

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { SettingSelect } from "@/components/settings/controls";
import { getSetting, setSetting } from "@/lib/settings";
import { useProjectStore } from "@/stores/projectStore";
import type { ProjectMeta } from "@/types/writeproj";

const STARTUP_KEY = "startupBehavior";

/** 启动行为：起始页 / 打开最近编辑的工程（App 启动时读取并生效） */
export function StartupBehavior() {
  const [value, setValue] = useState("start");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    void getSetting<string>(STARTUP_KEY, "start").then((v) => {
      if (!alive) return;
      setValue(v);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);
  if (!loaded) return null;
  return (
    <SettingSelect
      value={value}
      onChange={(v) => {
        setValue(v);
        void setSetting(STARTUP_KEY, v);
      }}
      options={[
        { label: "起始页", value: "start" },
        { label: "打开最近编辑的工程", value: "recent" },
      ]}
    />
  );
}

/** 最近打开的工程（≤8，可移除；不影响工程文件本身） */
export function RecentProjects() {
  const projects = useProjectStore((s) => s.projects);
  const recent = useProjectStore((s) => s.recent);
  const removeRecent = useProjectStore((s) => s.removeRecent);
  const list = recent
    .map((r) => ({
      meta: projects.find((p) => p.id === r.id),
      lastOpened: r.lastOpened,
    }))
    .filter((r): r is { meta: ProjectMeta; lastOpened: string } => !!r.meta);
  if (list.length === 0) {
    return <span className="text-[13px] text-fg-muted">暂无最近打开记录</span>;
  }
  return (
    <div className="flex w-full flex-col gap-1">
      {list.map(({ meta, lastOpened }) => (
        <div
          key={meta.id}
          className="flex items-center gap-3 rounded-lg border border-line/60 bg-panel-3/40 px-3 py-2.5"
        >
          <span className="min-w-0 flex-1 truncate text-[15px] text-fg">{meta.name}</span>
          <span className="shrink-0 text-[12px] text-fg-muted" title={lastOpened}>
            {relativeTime(lastOpened)}
          </span>
          <button
            title="从最近列表移除"
            onClick={() => void removeRecent(meta.id)}
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-hover hover:text-danger"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

/** 最近打开时间的相对描述（刚刚 / N 分钟前 / N 小时前 / N 天前 / N 个月前 / N 年前） */
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (!(diff >= 0)) return "刚刚";
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo} 个月前`;
  return `${Math.floor(mo / 12)} 年前`;
}

/** 语言（占位：当前仅简体中文） */
export function LanguageSetting() {
  return (
    <SettingSelect
      value="zh-CN"
      onChange={() => {}}
      options={[{ label: "简体中文（当前唯一）", value: "zh-CN" }]}
      disabled
    />
  );
}
