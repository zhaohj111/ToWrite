// 插件 > 插件实例：当前工程实例列表（新增/删除/启停/拖拽排序）+ 选中实例配置。
// scope project：无工程打开时灰置不可达（由设置页处理）；实例变更随工程配置（.writeproj）落盘。
// 拖拽排序复用手写 pointer 拖拽（WebView2 下 HTML5 DnD 不可靠）：拖动只显示插入细线，松开后重排。

import { useEffect, useRef, useState } from "react";
import { GripVertical, Package, Plus, Trash2 } from "lucide-react";
import { pluginRegistry } from "@/plugins/registry";
import {
  EDITOR_PROTOTYPE,
  TIMELINE_PROTOTYPE,
  usePluginStore,
  type PluginInstance,
} from "@/stores/pluginStore";
import { useEditorStore } from "@/stores/editorStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { useLoreStore, LORE_PROTOTYPE } from "@/stores/loreStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { cn } from "@/lib/cn";
import { SettingToggle } from "@/components/settings/controls";
import { InstanceConfig } from "@/components/settings/plugins/instanceConfig";
import { AddInstanceDialog } from "@/components/settings/plugins/addInstanceDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** 删除确认时按原型展示将被清除的数据范围 */
function instanceDataLabel(prototypeId: string): string {
  if (prototypeId === EDITOR_PROTOTYPE) return "分卷与章节正文";
  if (prototypeId === TIMELINE_PROTOTYPE) return "时间轴文件与节点";
  if (prototypeId === LORE_PROTOTYPE) return "设定库卡片与连线";
  return "全部相关数据";
}

export function PluginInstances() {
  const instances = usePluginStore((s) => s.instances);
  const reorderInstances = usePluginStore((s) => s.reorderInstances);
  const removeInstance = usePluginStore((s) => s.removeInstance);
  const updateInstance = usePluginStore((s) => s.updateInstance);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<PluginInstance | null>(null);
  const selected = instances.find((i) => i.id === selectedId) ?? instances[0] ?? null;

  /** 实例行选择：拖拽释放后吞掉随之而来的 click，避免误选 */
  const handleRowSelect = (id: string) => () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setSelectedId(id);
  };

  /** 确认删除：移除实例本身 + 其数据切片（editor/timeline/lore）+ 实例级设置覆盖 */
  const confirmDelete = () => {
    const inst = confirmRemove;
    if (!inst) return;
    const id = inst.id;
    removeInstance(id);
    useEditorStore.getState().removeSlice(id);
    useTimelineStore.getState().removeSlice(id);
    useLoreStore.getState().removeSlice(id);
    useSettingsStore.getState().removeInstanceSettings(id);
    setConfirmRemove(null);
  };

  // —— 指针拖拽排序 ——
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const pendingRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const dragRef = useRef<{ id: string } | null>(null);
  const dropRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const instancesRef = useRef(instances);
  instancesRef.current = instances;
  // 列表容器与各行元素：插入细线按实际 DOM 几何定位（不写死行高/偏移），行高/间距变化时仍准确
  const listRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const computeTarget = (x: number, y: number, movingId: string): number => {
      const n = instancesRef.current.length;
      const cur = instancesRef.current.findIndex((i) => i.id === movingId);
      const el = document.elementFromPoint(x, y);
      const row = el?.closest?.("[data-inst-index]") as HTMLElement | null;
      if (!row) {
        // 落点不在任何实例行上（列表上/下空白）：按相对列表的位置决定插到开头还是末尾
        const list = listRef.current;
        if (list) {
          const r = list.getBoundingClientRect();
          return y > r.top + r.height / 2 ? n - 1 : 0;
        }
        return n - 1;
      }
      const i = Number(row.dataset.instIndex);
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
      dropRef.current = computeTarget(e.clientX, e.clientY, p.id);
      setDropIndex(dropRef.current);
    };

    const onUp = () => {
      const d = dragRef.current;
      if (d) {
        const target = dropRef.current;
        if (target != null) {
          reorderInstances(reorderedIds(instancesRef.current, d.id, target));
        }
        suppressClickRef.current = true; // 拖拽释放后吞掉这次 click，避免误触实例选择
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

  // 插入细线位置（落点在完整列表中的视觉位置）
  const n = instances.length;
  const cur = dragId ? instances.findIndex((i) => i.id === dragId) : -1;
  const visualIndex =
    dragId != null && dropIndex != null
      ? dropIndex <= cur
        ? dropIndex
        : dropIndex + 1
      : -1;
  // 按实际行的上/下缘计算细线 top（相对列表容器）：插到某行前 → 贴该行上缘；
  // 插到末尾 → 贴最后一行下缘。-1 让 2px 细线居中对齐行间距（gap-0.5）。
  // 用 offsetTop/offsetHeight（布局像素，相对 offsetParent=列表容器）而非 getBoundingClientRect：
  // CSS zoom 缩放下 rect 是物理像素、top 是布局像素，直接套用会整体偏移（随 zoom 放大）。
  const lineTop = (() => {
    if (visualIndex < 0) return -999;
    const rows = rowRefs.current;
    if (visualIndex < rows.length) {
      const row = rows[visualIndex];
      if (!row) return -999;
      return row.offsetTop - 1;
    }
    const last = rows[rows.length - 1];
    if (!last) return -999;
    return last.offsetTop + last.offsetHeight - 1;
  })();

  return (
    <div className="flex h-full gap-0">
      {/* 左栏：实例列表 */}
      <div className="flex w-72 shrink-0 flex-col">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[13px] text-fg-muted">当前工程 {instances.length} 个实例</span>
          <button
            onClick={() => setAdding(true)}
            className="flex h-7 items-center gap-1 rounded-lg border border-line px-2 text-xs text-fg transition-colors hover:border-line-strong hover:bg-hover focus:border-accent/40"
          >
            <Plus className="size-3.5" /> 新增实例
          </button>
        </div>
        <div ref={listRef} className="relative">
          <div className="flex flex-col gap-0.5">
            {instances.map((inst, index) => (
              <InstanceRow
                key={inst.id}
                index={index}
                instance={inst}
                active={selected?.id === inst.id}
                dragging={dragId === inst.id}
                rowRef={(el) => (rowRefs.current[index] = el)}
                onSelect={handleRowSelect(inst.id)}
                onStartDrag={startDrag}
                onRemove={() => setConfirmRemove(inst)}
                onToggle={(v) => updateInstance(inst.id, { enabled: v })}
              />
            ))}
          </div>
          {dragId != null && dropIndex != null && (
            <div
              className="pointer-events-none absolute inset-x-1 z-10 h-0.5 rounded-full bg-accent"
              style={{ top: lineTop }}
            />
          )}
        </div>
      </div>

      {/* 右栏：选中实例配置 */}
      <div className="hidden-scrollbar min-w-0 flex-1 overflow-y-auto pl-4 pb-6">
        {selected ? (
          <InstanceConfig key={selected.id} instance={selected} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-fg-muted">
            暂无可配置实例
          </div>
        )}
      </div>

      <AddInstanceDialog open={adding} onClose={() => setAdding(false)} />

      {/* ===== 删除实例确认：连同实例数据一并删除 ===== */}
      <Dialog
        open={!!confirmRemove}
        onOpenChange={(open) => !open && setConfirmRemove(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除实例</DialogTitle>
            <DialogDescription>
              确定删除实例「{confirmRemove?.name}」？该实例的
              {confirmRemove ? instanceDataLabel(confirmRemove.prototypeId) : ""}
              将一并删除，且无法撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmRemove(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              <Trash2 className="size-4" /> 删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InstanceRow({
  index,
  instance,
  active,
  dragging,
  rowRef,
  onSelect,
  onStartDrag,
  onRemove,
  onToggle,
}: {
  index: number;
  instance: PluginInstance;
  active: boolean;
  dragging: boolean;
  rowRef?: (el: HTMLDivElement | null) => void;
  onSelect: () => void;
  onStartDrag: (e: React.PointerEvent, id: string) => void;
  onRemove: () => void;
  onToggle: (v: boolean) => void;
}) {
  const proto = pluginRegistry.getModule(instance.prototypeId);
  const Icon = proto?.views?.activityBar?.icon ?? Package;
  return (
    <div
      ref={rowRef}
      data-inst-index={index}
      className={cn(
        "group flex items-center gap-1 rounded-xl border px-1.5 py-2 transition-colors",
        active ? "border-accent/30 bg-accent/10" : "border-transparent hover:bg-hover",
        dragging && "opacity-40",
        !instance.enabled && "opacity-60",
      )}
    >
      <button
        onPointerDown={(e) => onStartDrag(e, instance.id)}
        className="flex size-6 shrink-0 cursor-grab items-center justify-center rounded-md text-fg-muted/50 transition-colors hover:text-fg active:cursor-grabbing"
        title="拖动排序"
      >
        <GripVertical className="size-4" />
      </button>
      <button
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-panel-2 text-fg-muted">
          <Icon className="size-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] text-fg">{instance.name}</div>
          <div className="truncate font-mono text-[11px] text-fg-muted">
            {instance.prototypeId}
          </div>
        </div>
      </button>
      <SettingToggle checked={instance.enabled} onChange={onToggle} />
      <button
        onClick={onRemove}
        title="删除实例"
        className="flex size-6 shrink-0 items-center justify-center rounded-md text-fg-muted opacity-0 transition-all hover:bg-danger/10 hover:text-danger group-hover:opacity-100"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

/** 由全量实例 + 被拖项与落点重建顺序：其余实例保持原位，被拖项插入 target 处 */
function reorderedIds(
  instances: PluginInstance[],
  movingId: string,
  target: number,
): string[] {
  const ids = instances.map((i) => i.id);
  const rest = ids.filter((id) => id !== movingId);
  rest.splice(Math.min(Math.max(target, 0), rest.length), 0, movingId);
  return rest;
}
