// 内容页：Activity Bar + 侧边栏 + 主区域 + 状态栏。

import { ActivityBar } from "@/components/activityBar";
import { Sidebar } from "@/components/sidebar";
import { MainArea } from "@/components/mainArea";
import { StatusBar } from "@/components/statusBar";

export function ContentPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1">
        <ActivityBar />
        <Sidebar />
        <MainArea />
      </div>
      <StatusBar />
    </div>
  );
}
