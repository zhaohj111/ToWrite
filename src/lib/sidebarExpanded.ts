// 侧栏文件夹展开状态持久化：按「工程 id + 插件实例 id」记录到 config.json，
// 打开工程后恢复上次的展开/折叠样子；无记录时默认全部折叠（不默认展开）。
// 三个侧栏（章节 / 时间轴 / 设定库）共用本 hook。

import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { getSetting, setSetting } from "@/lib/settings";

export interface SidebarExpandedApi {
  /** 是否展开（无记录 = 折叠） */
  isExpanded: (id: string) => boolean;
  /** 切换展开/折叠并持久化 */
  toggleExpanded: (id: string) => void;
  /** 展开（用于「在该文件夹内新建」时自动展开父级） */
  expand: (id: string) => void;
}

export function useSidebarExpanded(instanceId: string): SidebarExpandedApi {
  const projectId = useWorkspaceStore((s) => s.project?.meta.id ?? "");
  const key = `sidebarExpanded.${projectId}.${instanceId}`;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const keyRef = useRef(key);
  keyRef.current = key;

  // 工程/实例切换时读取该键的展开集合
  useEffect(() => {
    let alive = true;
    void getSetting<string[]>(key, []).then((ids) => {
      if (!alive) return;
      setExpanded(new Set(Array.isArray(ids) ? ids : []));
    });
    return () => {
      alive = false;
    };
  }, [key]);

  const persist = useCallback((next: Set<string>) => {
    void setSetting(keyRef.current, [...next]);
  }, []);

  const isExpanded = useCallback((id: string) => expanded.has(id), [expanded]);

  const toggleExpanded = useCallback(
    (id: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const expand = useCallback(
    (id: string) => {
      setExpanded((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  return { isExpanded, toggleExpanded, expand };
}
