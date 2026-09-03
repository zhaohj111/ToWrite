// core.config —— 应用核心模块：设置界面（settings.pages 贡献点）后端（仅契约声明）。
// 内容分层：
//   - index.tsx         模块契约/元数据（不可禁用、不可实例化）
//   - pagesContribs.tsx 全部设置页注册（settings.pages）
//   - README.md / CHANGELOG.md  详情与更新日志

import type { ModuleContract } from "@/types/plugin";
// 内容解耦：详情 / 更新日志为 .md，与模块代码同目录
import configReadme from "./README.md?raw";
import configChangelog from "./CHANGELOG.md?raw";
import { registerConfigPages } from "./pagesContribs";

export const coreConfigModule: ModuleContract = {
  id: "core.config",
  name: "设置中心",
  description: "应用核心：设置界面、级联配置与快捷键注册表。不可禁用、不可实例化。",
  readme: configReadme,
  changelogMd: configChangelog,
  kind: "core",
  enabled: true,
  author: "拓文官方",
  version: "0.6.4",
  activate: (ctx) => {
    // 全部设置页注册在 pagesContribs.tsx
    registerConfigPages(ctx);
  },
};
