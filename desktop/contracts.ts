export type GraphicsMode = "compatibility" | "hardware" | "linux-opengl" | "linux-opengl-unblocked";
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
  telemetry(
    event: "error" | "frames" | "renderer" | "action",
    fields: Record<string, string | number | boolean | null>,
  ): void;
  observabilityStatus(): Promise<{
    sessionId: string;
    directory: string;
    queued: number;
    dropped: number;
    writeFailures: number;
    activeAlerts: string[];
  }>;
  openLogs(): Promise<void>;
  exportLogBundle(): Promise<boolean>;
}
