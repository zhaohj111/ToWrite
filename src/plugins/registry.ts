// 插件注册表（pluginRegistry）：v0.5 骨架，区分两类注册——
//   1. 功能插件注册（重型模块 core.editor / core.lore / core.timeline）
//   2. 贡献点注册（editor.toolbar / editor.commands / ... / i18n.resources）

import type { ContributionMap, ContributionPoint, ModuleContract } from "@/types/plugin";

type Listener = () => void;

let version = 0;

class PluginRegistry {
  private modules = new Map<string, ModuleContract>();
  private contributions = new Map<ContributionPoint, unknown[]>();
  private listeners = new Set<Listener>();

  registerModule(module: ModuleContract): void {
    this.modules.set(module.id, module);
    const ctx = {
      registerContribution: <P extends ContributionPoint>(
        point: P,
        contribution: ContributionMap[P],
      ) => this.registerContribution(point, contribution),
    };
    try {
      module.activate(ctx);
    } catch (e) {
      console.error(`模块 ${module.id} 激活失败`, e);
    }
    this.emit();
  }

  registerContribution<P extends ContributionPoint>(
    point: P,
    contribution: ContributionMap[P],
  ): void {
    const list = this.contributions.get(point) ?? [];
    list.push(contribution);
    this.contributions.set(point, list);
    this.emit();
  }

  getContributions<P extends ContributionPoint>(point: P): ContributionMap[P][] {
    return (this.contributions.get(point) ?? []) as ContributionMap[P][];
  }

  listModules(): ModuleContract[] {
    return Array.from(this.modules.values());
  }

  getModule(id: string): ModuleContract | null {
    return this.modules.get(id) ?? null;
  }

  getVersion(): number {
    return version;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    version++;
    this.listeners.forEach((fn) => fn());
  }
}

export const pluginRegistry = new PluginRegistry();

export function registerCoreModules(...modules: ModuleContract[]): void {
  modules.forEach((m) => pluginRegistry.registerModule(m));
}
