// Install diagnostics before importing React, R3F, or either GPU backend.
import "./diagnostics";
if (window.pinefallDesktop?.runtime.mode === "compatibility")
  document.documentElement.classList.add("desktop-compatibility");
void import("./main").catch((error: unknown) => {
  window.pinefallDiagnostics?.report("Application startup failed", error);
});
