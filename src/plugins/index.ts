// 插件装配入口：注册官方重型模块。
// v1.0 起：此处将同时扫描本地 plugins/ 目录加载声明式第三方插件。

import { registerCoreModules } from "@/plugins/registry";
import { coreEditorModule } from "@/plugins/modules/coreEditor";
import { coreLoreModule } from "@/plugins/modules/coreLore";
import { coreTimelineModule } from "@/plugins/modules/coreTimeline";

export function initPlugins(): void {
  registerCoreModules(coreEditorModule, coreLoreModule, coreTimelineModule);
}
