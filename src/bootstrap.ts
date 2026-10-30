// Install diagnostics before importing React, R3F, or either GPU backend.
import "./diagnostics";
void import("./main").catch((error: unknown) => {
  window.pinefallDiagnostics?.report("Application startup failed", error);
});
