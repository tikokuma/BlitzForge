import { getCurrentWindow } from "@tauri-apps/api/window";

import { byId, errorMessage } from "./dom";

export function setupWindowControls(reportMessage: (message: string) => void): void {
  const appWindow = getCurrentWindow();

  const maximizeButton = byId("window-maximize", HTMLButtonElement);
  const maximizeIcon = byId("window-maximize-icon", HTMLSpanElement);
  const reportWindowError = (error: unknown) => {
    reportMessage(`ウィンドウ操作に失敗しました: ${errorMessage(error)}`);
  };
  const runWindowAction = (action: Promise<unknown>) => {
    void action.catch(reportWindowError);
  };
  const updateMaximizeState = async () => {
    try {
      const maximized = await appWindow.isMaximized();
      maximizeIcon.textContent = maximized ? "❐" : "□";
      maximizeButton.setAttribute("aria-label", maximized ? "元のサイズに戻す" : "最大化");
    } catch (error) {
      reportWindowError(error);
    }
  };
  const toggleMaximize = () => {
    runWindowAction(appWindow.toggleMaximize().then(updateMaximizeState));
  };
  let resizeTimer: number | null = null;
  const scheduleMaximizeStateUpdate = () => {
    if (resizeTimer !== null) window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      resizeTimer = null;
      void updateMaximizeState();
    }, 100);
  };

  byId("window-minimize").addEventListener("click", () => runWindowAction(appWindow.minimize()));
  maximizeButton.addEventListener("click", toggleMaximize);
  byId("window-close").addEventListener("click", () => runWindowAction(appWindow.close()));
  byId("window-titlebar-drag-region").addEventListener("dblclick", toggleMaximize);
  runWindowAction(appWindow.onResized(scheduleMaximizeStateUpdate));
  void updateMaximizeState();
}
