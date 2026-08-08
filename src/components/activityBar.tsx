// Activity Bar：模块入口 + 底部“回到开始页”。
// 支持拖拽调整插件实例顺序（手写 pointer 拖拽，WebView2 下原生 HTML5 DnD 不可靠）：
// 拖动时只显示目标位置的朱砂插入细线，松开后重排并随工程配置（.writeproj）持久化。

import { useEffect, useRef, useState } from "react";
import { Home } from "lucide-react";
import { useActivityItems, type ActivityItem } from "@/plugins/hooks";
import { useLayoutStore } from "@/stores/layoutStore";
import { useProjectStore } from "@/stores/projectStore";
import { usePluginStore, type PluginInstance } from "@/stores/pluginStore";
import { cn } from "@/lib/cn";

/** 每行入口高度（h-12） */
const ITEM_H = 48;
/** 容器顶部内边距（py-1），插入细线定位据此偏移 */
const PAD_TOP = 4;

export function ActivityBar() {
  const items = useActivityItems();
  const instances = usePluginStore((s) => s.instances);
  const reorderInstances = usePluginStore((s) => s.reorderInstances);
  const sidebarId = useLayoutStore((s) => s.sidebarId);
  const mainViewId = useLayoutStore((s) => s.mainViewId);
  const toggleSidebar = useLayoutStore((s) => s.toggleSidebar);
  const setMainView = useLayoutStore((s) => s.setMainView);
  const closeProject = useProjectStore((s) => s.closeProject);

  // —— 指针拖拽（不依赖 HTML5 DnD，WebView2 下稳定）——
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const pendingRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const dragRef = useRef<{ id: string } | null>(null);
  const dropRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  // 拖拽期间数据保持不变，这里用 ref 让 window 监听器始终拿到最新列表
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const instancesRef = useRef(instances);
  instancesRef.current = instances;

  useEffect(() => {
    // 把指针位置换算成落点（目标 = 移除被拖项后其应插入的位置，0..n-1）：
    // 命中 [data-ab-index] 行按行中点分上下；被拖行自身恒为 no-op；
    // 落在列表外（Home 区/空白）视为追加末尾。
    const computeTarget = (x: number, y: number, movingId: string): number => {
      const n = itemsRef.current.length;
      const cur = itemsRef.current.findIndex((it) => it.id === movingId);
      const el = document.elementFromPoint(x, y);
      const row = el?.closest?.("[data-ab-index]") as HTMLElement | null;
      if (!row) return n - 1;
      const i = Number(row.dataset.abIndex);
      const rect = row.getBoundingClientRect();
      const above = y < rect.top + rect.height / 2;
      if (i === cur) return cur;
      if (i < cur) return above ? i : i + 1;
      return above ? i - 1 : i;
    };

    const onMove = (e: PointerEvent) => {
      const p = pendingRef.current;
      if (!p) return;
      if (!dragRef.current) {
        if ((e.clientX - p.x) ** 2 + (e.clientY - p.y) ** 2 < 16) return; // 4px 判定为点击
        dragRef.current = { id: p.id };
        setDragId(p.id);
      }
      const target = computeTarget(e.clientX, e.clientY, p.id);
      dropRef.current = target;
      setDropIndex(target);
    };

    const onUp = () => {
      suppressClickRef.current = false;
      const d = dragRef.current;
      if (d) {
        const target = dropRef.current;
        if (target != null) {
          reorderInstances(
            computeOrderedIds(instancesRef.current, itemsRef.current, d.id, target),
          );
        }
        suppressClickRef.current = true; // 拖拽释放后吞掉这次 click，避免误切换侧边栏
      }
      pendingRef.current = null;
      dragRef.current = null;
      dropRef.current = null;
      setDragId(null);
      setDropIndex(null);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && (dragRef.current || pendingRef.current)) {
        pendingRef.current = null;
        dragRef.current = null;
        dropRef.current = null;
        setDragId(null);
        setDropIndex(null);
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
    };
  }, [reorderInstances]);

  const startDrag = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0 || e.pointerType !== "mouse") return;
    suppressClickRef.current = false;
    pendingRef.current = { id, x: e.clientX, y: e.clientY };
    dragRef.current = null;
    dropRef.current = null;
    setDragId(null);
    setDropIndex(null);
  };

  const isActive = (item: ActivityItem) =>
    sidebarId === item.sidebarId || mainViewId === item.mainViewId;

  // 落点在完整列表（含被拖行）中的边界位置 0..n，用于插入细线的 top 偏移
  const n = items.length;
  const cur = dragId ? items.findIndex((it) => it.id === dragId) : -1;
  const visualIndex =
    dragId != null && dropIndex != null
      ? dropIndex <= cur
        ? dropIndex
        : dropIndex + 1
      : -1;
  const lineTop = PAD_TOP + visualIndex * ITEM_H - 1;

  return (
    <div className="relative flex w-[52px] shrink-0 select-none flex-col items-center border-r border-line/60 bg-app py-1">
      {items.map((item, index) => (
        <button
          key={item.id}
          data-ab-index={index}
          title={item.label}
          onPointerDown={(e) => startDrag(e, item.id)}
          onClick={() => {
            if (suppressClickRef.current) {
              suppressClickRef.current = false;
              return;
            }
            toggleSidebar(item.sidebarId ?? null);
            if (item.mainViewId) setMainView(item.mainViewId);
          }}
          className={cn(
            "group relative flex h-12 w-full items-center justify-center transition-all duration-200 active:scale-90",
            isActive(item) ? "text-accent" : "text-fg-muted hover:text-fg",
            dragId === item.id && "opacity-40",
          )}
        >
          {isActive(item) && (
            <span className="absolute left-0 top-1/2 h-7 w-[2.5px] -translate-y-1/2 rounded-full bg-accent" />
          )}
          <item.icon
            className={cn(
              "size-[21px] transition-transform duration-200 group-hover:scale-110",
            )}
          />
        </button>
      ))}
      {dragId != null && dropIndex != null && (
        <div
          className="pointer-events-none absolute inset-x-1 z-10 h-0.5 rounded-full bg-accent"
          style={{ top: lineTop }}
        />
      )}
      <div className="flex-1" />
      <button
        title="回到开始页"
        className="group flex h-12 w-full items-center justify-center text-fg-muted transition-all duration-200 hover:text-accent"
        onClick={closeProject}
      >
        <Home className="size-5 transition-transform duration-200 group-hover:scale-110" />
      </button>
    </div>
  );
}

/** 由全量实例 + 活动栏可显示项 + 被拖项与落点，重建全量实例顺序：
    可显示实例按目标顺序排，隐藏实例（禁用/无活动栏）保持原位。 */
function computeOrderedIds(
  instances: PluginInstance[],
  items: ActivityItem[],
  movingId: string,
  target: number,
): string[] {
  const byId = new Map(instances.map((i) => [i.id, i]));
  const visibleIds = items.map((i) => i.id);
  const visibleSet = new Set(visibleIds);
  const targetVisible = visibleIds.filter((id) => id !== movingId);
  targetVisible.splice(target, 0, movingId);
  const result: string[] = [];
  let ptr = 0;
  for (const inst of instances) {
    if (inst.id === movingId) continue;
    if (visibleSet.has(inst.id)) {
      const id = targetVisible[ptr++];
      if (id) result.push(id);
    } else {
      result.push(inst.id);
    }
  }
  return result;
}
