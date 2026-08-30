// core.config —— 应用核心模块：设置界面（settings.pages 贡献点）后端。
// kind "core"：不可启用/禁用、不可实例化、不可排序；在「已安装插件」页仅信息展示。
// 注册：应用 4 页 + 关于应用 + 关于项目（scope project）+ AI 占位页。
// 插件管理双栏（已安装插件 / 插件实例）页面在阶段 3 追加注册到同一模块。

import type { ModuleContract } from "@/types/plugin";
// 内容解耦：详情 / 更新日志为 .md，与模块代码同目录
import configReadme from "./README.md?raw";
import configChangelog from "./CHANGELOG.md?raw";
import {
  LanguageSetting,
  RecentProjects,
  StartupBehavior,
} from "@/components/settings/pages/appGeneral";
import {
  MainViewControl,
  StartBackgroundControl,
  ThemeControl,
  ZoomControl,
} from "@/components/settings/pages/appAppearance";
import { AutoBackup, DataMigration, StorageDir } from "@/components/settings/pages/appStorage";
import { AppShortcutsList } from "@/components/settings/pages/appShortcuts";
import { AuthorInfo, FeedbackEntry, LicenseInfo } from "@/components/settings/pages/aboutApp";
import { UpdateControl } from "@/components/settings/pages/updateControl";
import { ChangelogPage } from "@/components/settings/pages/changelog";
import { SponsorPage } from "@/components/settings/pages/sponsor";
import { SupporterListPage } from "@/components/settings/pages/supporterList";
// 应用级更新日志：仓库根目录 CHANGELOG.md（随包打包，?raw 原样导入）
import appChangelog from "../../../../CHANGELOG.md?raw";
import { ProjectMetaInfo, ProjectNameField, ProjectNoteField, ProjectStats } from "@/components/settings/pages/aboutProject";
import { AiSettingsPlaceholder } from "@/components/settings/pages/aiSettings";
import { InstalledPlugins } from "@/components/settings/plugins/installedPlugins";
import { PluginInstances } from "@/components/settings/plugins/pluginInstances";

export const coreConfigModule: ModuleContract = {
  id: "core.config",
  name: "设置中心",
  description: "应用核心：设置界面、级联配置与快捷键注册表。不可禁用、不可实例化。",
  readme: configReadme,
  changelogMd: configChangelog,
  kind: "core",
  enabled: true,
  author: "拓文官方",
  version: "0.6.0",
  activate: (ctx) => {
    // ---- 应用分组 ----
    ctx.registerContribution("settings.pages", {
      id: "app.general",
      title: "通用与启动",
      group: "app",
      path: "应用 > 通用与启动",
      scope: "app",
      items: [
        {
          id: "startup",
          title: "启动行为",
          description: "启动应用后停留在起始页，或直接打开最近编辑的工程。",
          keywords: ["启动", "startup", "最近工程", "起始页", "开机"],
          scope: "app",
          path: "应用 > 通用与启动",
          render: () => <StartupBehavior />,
        },
        {
          id: "recent",
          title: "最近打开的工程",
          description: "从最近列表移除条目（不影响工程文件本身）。",
          keywords: ["最近", "recent", "历史", "记录", "打开"],
          scope: "app",
          path: "应用 > 通用与启动",
          layout: "stack",
          render: () => <RecentProjects />,
        },
        {
          id: "language",
          title: "界面语言",
          description: "更多语言将在后续版本提供。",
          keywords: ["语言", "language", "简体中文", "国际化"],
          scope: "app",
          path: "应用 > 通用与启动",
          render: () => <LanguageSetting />,
        },
      ],
    });

    ctx.registerContribution("settings.pages", {
      id: "app.appearance",
      title: "外观与界面",
      group: "app",
      path: "应用 > 外观与界面",
      scope: "app",
      items: [
        {
          id: "theme",
          title: "主题",
          description: "纸白（浅色）与墨夜（深色）两种外观。",
          keywords: ["主题", "theme", "深色", "浅色", "外观", "颜色"],
          scope: "app",
          path: "应用 > 外观与界面",
          render: () => <ThemeControl />,
        },

        {
          id: "zoom",
          title: "界面缩放",
          description: "整体界面缩放档位（不影响正文编辑字号）。",
          keywords: ["缩放", "zoom", "界面", "尺寸", "显示"],
          scope: "app",
          path: "应用 > 外观与界面",
          render: () => <ZoomControl />,
        },        {
          id: "startBg",
          title: "开始页背景",
          description: "开始页的背景效果（默认无）。",
          keywords: ["开始页", "背景", "线条", "动画", "效果", "动态", "启动页"],
          scope: "app",
          path: "应用 > 外观与界面",
          render: () => <StartBackgroundControl />,
        },
      ],
    });

    ctx.registerContribution("settings.pages", {
      id: "app.storage",
      title: "存储与备份",
      group: "app",
      path: "应用 > 存储与备份",
      scope: "app",
      items: [
        {
          id: "dir",
          title: "工程存储目录",
          description: "工程文件（.writeproj）的存放位置（迁移后的实际位置）。",
          keywords: ["存储", "目录", "path", "位置", "工程文件", "磁盘"],
          scope: "app",
          path: "应用 > 存储与备份",
          render: () => <StorageDir />,
        },
        {
          id: "migrate",
          title: "数据迁移",
          description: "把工程数据整体移动到其他磁盘位置；C 盘应用数据处仅保留数据地址指针。",
          keywords: ["迁移", "migrate", "移动", "磁盘", "空间", "指针", "数据"],
          scope: "app",
          path: "应用 > 存储与备份",
          layout: "stack",
          render: () => <DataMigration />,
        },
        {
          id: "backup",
          title: "自动备份",
          description: "周期性自动备份将在 v1.0 提供。",
          keywords: ["备份", "backup", "自动", "安全"],
          scope: "app",
          path: "应用 > 存储与备份",
          render: () => <AutoBackup />,
        },
      ],
    });

    ctx.registerContribution("settings.pages", {
      id: "app.shortcuts",
      title: "应用快捷键",
      group: "app",
      path: "应用 > 应用快捷键",
      scope: "app",
      items: [
        {
          id: "list",
          title: "应用壳命令",
          description: "应用级命令的默认键位；插件作用域键位的改绑见对应插件的「配置」tab。",
          keywords: ["快捷键", "键位", "shortcut", "键盘", "快捷键"],
          scope: "app",
          path: "应用 > 应用快捷键",
          layout: "stack",
          render: () => <AppShortcutsList />,
        },
      ],
    });

    // ---- 工程分组：视图与布局（scope project，无工程灰置）----
    ctx.registerContribution("settings.pages", {
      id: "project.view",
      title: "视图与布局",
      group: "project",
      path: "工程 > 视图与布局",
      scope: "project",
      items: [
        {
          id: "mainView",
          title: "默认主视图",
          description: "该工程打开后默认展示的主区域视图（随工程保存）。",
          keywords: ["主视图", "main", "视图", "布局", "默认"],
          scope: "project",
          path: "工程 > 视图与布局",
          render: () => <MainViewControl />,
        },
      ],
    });

    // ---- 关于分组 ----
    ctx.registerContribution("settings.pages", {
      id: "about.app",
      title: "关于应用",
      group: "about",
      path: "关于 > 关于应用",
      scope: "app",
      items: [
        {
          id: "version",
          title: "版本与更新",
          description: "当前版本、检查更新（GitHub Releases）与更新下载（仅支持最新版本下载，若需旧版本请自行前往 GitHub Releases 页面下载）。",
          keywords: ["版本", "version", "更新", "检查更新", "升级", "自动检查", "关于"],
          scope: "app",
          path: "关于 > 关于应用",
          layout: "stack",
          render: () => <UpdateControl />,
        },
        {
          id: "author",
          title: "作者",
          description: "拓文（ToWrite）的开发者。",
          keywords: ["作者", "author", "开发者", "署名", "GitHub", "关于"],
          scope: "app",
          path: "关于 > 关于应用",
          render: () => <AuthorInfo />,
        },
        {
          id: "license",
          title: "开源许可",
          description: "拓文基于 MIT 许可开源。",
          keywords: ["许可", "license", "开源", "MIT", "协议"],
          scope: "app",
          path: "关于 > 关于应用",
          layout: "stack",
          render: () => <LicenseInfo />,
        },
        {
          id: "feedback",
          title: "反馈与文档",
          description: "反馈渠道与使用文档将在 v1.0 提供。",
          keywords: ["反馈", "feedback", "文档", "帮助", "支持"],
          scope: "app",
          path: "关于 > 关于应用",
          render: () => <FeedbackEntry />,
        },
      ],
    });

    ctx.registerContribution("settings.pages", {
      id: "about.changelog",
      title: "更新日志",
      group: "about",
      path: "关于 > 更新日志",
      scope: "app",
      items: [],
      // 自定义布局：左大纲 + 右正文（md 源为仓库根 CHANGELOG.md）
      component: () => <ChangelogPage source={appChangelog} />,
    });

    ctx.registerContribution("settings.pages", {
      id: "about.sponsor",
      title: "赞助支持",
      group: "about",
      path: "关于 > 赞助支持",
      scope: "app",
      // 搜索索引项（页面内容由 component 自定义布局渲染）
      items: [
        {
          id: "entry",
          title: "赞助支持",
          description: "通过爱发电赞助作者（金额与昵称可在页面内自定义）。",
          keywords: ["赞助", "支持", "打赏", "捐赠", "爱发电", "afdian", "ifdian", "咖啡", "coffee"],
          scope: "app",
          path: "关于 > 赞助支持",
          render: () => null,
        },
      ],
      component: SponsorPage,
    });

ctx.registerContribution("settings.pages", {
      id: "about.supporter",
      title: "支持者名单",
      group: "about",
      path: "关于 > 支持者名单",
      scope: "app",
      // 搜索索引项（页面内容由 component 自定义布局渲染）
      items: [
        {
          id: "list",
          title: "支持者名单",
          description: "本项目赞助者名单（启动时从仓库根目录 Supporter.md 拉取，文件不存在时不显示）。",
          keywords: ["支持者", "名单", "赞助", "supporter", "榜单", "致谢"],
          scope: "app",
          path: "关于 > 支持者名单",
          render: () => null,
        },
      ],
      component: SupporterListPage,
    });

    ctx.registerContribution("settings.pages", {
      id: "about.project",
      title: "关于项目",
      group: "project",
      path: "工程 > 关于项目",
      scope: "project",
      items: [
        {
          id: "name",
          title: "工程名称",
          description: "修改后写入当前工程文件。",
          keywords: ["工程", "项目", "名称", "重命名"],
          scope: "project",
          path: "工程 > 关于项目",
          render: () => <ProjectNameField />,
        },
        {
          id: "note",
          title: "工程备注",
          description: "记录目标、灵感或写作计划（随工程保存）。",
          keywords: ["工程", "项目", "备注", "note", "描述"],
          scope: "project",
          path: "工程 > 关于项目",
          layout: "stack",
          render: () => <ProjectNoteField />,
        },
        {
          id: "info",
          title: "元数据与位置",
          description: "创建/更新时间、格式版本与 .writeproj 文件位置。",
          keywords: ["工程", "元数据", "路径", "位置", "格式", "时间"],
          scope: "project",
          path: "工程 > 关于项目",
          layout: "stack",
          render: () => <ProjectMetaInfo />,
        },
        {
          id: "stats",
          title: "内容统计",
          description: "章节数、全文字数与设定卡片 / 时间轴节点统计。",
          keywords: ["统计", "字数", "章节", "卡片", "节点"],
          scope: "project",
          path: "工程 > 关于项目",
          layout: "stack",
          render: () => <ProjectStats />,
        },
      ],
    });

    // ---- 插件分组 ----
    ctx.registerContribution("settings.pages", {
      id: "plugin.installed",
      title: "已安装插件",
      group: "plugin",
      path: "插件 > 已安装插件",
      scope: "app",
      items: [],
      // 自定义双栏布局：左栏原型列表（启停）+ 右栏插件详情（详情/更新日志/配置）
      component: InstalledPlugins,
    });

    ctx.registerContribution("settings.pages", {
      id: "plugin.instances",
      title: "插件实例",
      group: "plugin",
      path: "插件 > 插件实例",
      scope: "project",
      items: [],
      // 自定义双栏布局：左栏当前工程实例列表 + 右栏实例配置；scope project，无工程灰置
      component: PluginInstances,
    });

    // ---- AI 分组（占位，v0.7 提供；分组整体灰置）----
    ctx.registerContribution("settings.pages", {
      id: "ai.settings",
      title: "AI 相关设置",
      group: "ai",
      path: "AI > AI 相关设置",
      scope: "app",
      items: [
        {
          id: "placeholder",
          title: "AI 协作",
          description: "AI 协作能力将在 v0.7 提供。",
          keywords: ["AI", "模型", "智能", "协作", "润色"],
          scope: "app",
          path: "AI > AI 相关设置",
          render: () => <AiSettingsPlaceholder />,
        },
      ],
    });
  },
};
