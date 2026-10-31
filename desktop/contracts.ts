export type GraphicsMode = "compatibility" | "hardware";
export interface DesktopRuntime {
  mode: GraphicsMode;
  platform: string;
  version: string;
  targetFps: 30 | 60;
  maxRenderWidth: number;
  maxRenderHeight: number;
}
export interface DesktopBridge {
  runtime: Readonly<DesktopRuntime>;
  ready(): void;
  setGraphicsMode(mode: GraphicsMode): Promise<void>;
  exportDiagnostics(): Promise<boolean>;
}
