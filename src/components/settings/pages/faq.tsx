// 常见问题（help.faq）：下拉式问题列表——点击问题展开答案，默认收起。
// 答案为参考版（由作者核对/改写）：修改位置见 FAQ_ITEMS 数组的 a 字段（q 为问题）。

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/** 问题清单：q 问题 / a 参考答案（未填写时显示「答案待补充」） */
const FAQ_ITEMS: { q: string; a?: string }[] = [
  { q: "我不需要那么多插件，怎么关闭？",
    a: `在「设置>插件」找到对应插件，右侧开关关闭即可（仅停用不影响数据，随时可重新启用）。
    「已安装插件」中开关影响所有工程，「插件实例」中开关仅影响该实例。
    也可在「插件实例」中删除插件实例（会删除当前工程该实例所有数据）。`
   },
  { q: "怎么修改字体大小等插件默认配置？",
    a: `在「设置>插件>已安装插件」找到对应插件，点击最右侧的「配置」tab即可浏览或修改默认配置，或在「插件实例」中直接修改。
    「已安装插件」中修改默认配置影响所有工程，「插件实例」中修改默认配置仅影响该实例。`
   },
  { q: "插件有快捷键么，怎么查看与换绑？",
    a: `在「设置>插件>已安装插件」中找到对应插件，点击最右侧的「配置」tab即可查看或换绑快捷键。`
  },
  { q: "我遇见了Bug/有建议，怎么反馈？",
    a: `「设置>关于应用>反馈与文档」进入 GitHub 仓库（zhaohj111）提交 issue，附上版本号、复现步骤与截图。
    建议类需求也走同一渠道。`
   },
  { q: "我赞助了，支持者名单怎么没有我？",
    a:`赞助者名单暂时为作者手动更新维护，不可能做到实时更新，请耐心等待下次名单内容更新时查看是否有你的昵称。
    也可直接在爱发电平台私信提醒作者。`
   },
  { q: "我的数据存在哪里，能迁移么，会被上传么？",
    a: `数据完全存储在本地，不会自动上传，毕竟我们的项目根本没有服务器（手动狗头）。
    数据默认路径为「C:\\Users\\用户名\\AppData\\Roaming\\com.towrite.desktop」。
    迁移后以上位置仅留必要的文件，json后缀文件请勿删除。其中updates文件夹中为历次版本更新安装包，可安全删除。
    「设置>应用>存储与备份」中提供了数据迁移功能，注意：迁移数据时不要迁移到应用安装文件夹下，应用更新时安装目录会被覆盖。
    例如：应用安装目录为「D:\\ToWrite」，数据目录应该为「D:\\ToWriteData」而不是「D:\\ToWrite\\data」。`
   },
  { q: "我能自制插件或者使用别人的插件么？",
    a:`可以的，应用是开源的，任何人都可以自制插件或使用别人的插件。
    需要强调的是，现版本（0.6）并没有对外部挂载插件的良好支持，也没有原生的插件市场，暂不建议使用自制或外部插件。
    不过，自制插件与插件市场在更新计划之中，毕竟插件架构就是为此而生的。请期待后续更新。`
   },
  { q: "应用崩溃/卡死时怎么办？",
    a:`先重启应用（数据均为本地保存，已完成的操作不会丢失）；若可复现，请在「设置>关于应用>反馈」提交 issue，说明：版本号、崩溃前的操作步骤、是否必现、最好附上截图。`
  },
];

export const FaqPage = () => {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="max-w-3xl">
      <div className="flex flex-col gap-2">
        {FAQ_ITEMS.map((item, i) => {
          const expanded = open === i;
          return (
            <div
              key={i}
              className={cn(
                "overflow-hidden rounded-xl border transition-colors",
                expanded ? "border-accent/30 bg-panel-2/60" : "border-line/60 bg-panel-2/30 hover:border-line-strong",
              )}
            >
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : i)}
                className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
              >
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-panel-3 text-[10px] font-semibold text-fg-muted">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 text-[14px] font-medium text-fg-strong">
                  {item.q}
                </span>
                <ChevronDown
                  className={cn(
                    "size-4 shrink-0 text-fg-muted transition-transform duration-200",
                    expanded && "rotate-180",
                  )}
                />
              </button>
              {expanded && (
                <div className="border-t border-line/60 px-4 py-3 pl-11">
                  {item.a ? (
                    <p className="text-[13px] leading-relaxed whitespace-pre-line text-fg">{item.a}</p>
                  ) : (
                    <p className="text-[12px] text-fg-muted/70">答案待补充</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
