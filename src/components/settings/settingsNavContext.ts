// 设置页内导航上下文：供自定义布局页（插件管理双栏等）跳转到其他分组/页面。

import { createContext, useContext } from "react";

export interface SettingsNavApi {
  navigate: (group: string, pageId: string) => void;
}

export const SettingsNavContext = createContext<SettingsNavApi>({
  navigate: () => {},
});

export function useSettingsNav(): SettingsNavApi {
  return useContext(SettingsNavContext);
}
