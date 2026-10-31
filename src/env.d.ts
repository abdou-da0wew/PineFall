/// <reference types="@vgpu/wgsl/wgsl-types" />
interface Window {
  pinefallDesktop?: import("../desktop/contracts").DesktopBridge;
  pinefallDiagnostics?: {
    report(source: string, message: unknown, details?: string | null): void;
    clear(): void;
  };
  webkitAudioContext?: typeof AudioContext;
  /** Browser-test-owned handle; never assigned by application code. */
  testDevice?: GPUDevice;
}
