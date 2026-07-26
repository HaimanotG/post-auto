import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement the Blob URL registry; stub these so components
// that preview a locally-picked file (e.g. PostComposer's phone upload) work
// under test without needing a real browser.
if (typeof URL.createObjectURL !== "function") {
  URL.createObjectURL = () => "blob:fixture-url";
}
if (typeof URL.revokeObjectURL !== "function") {
  URL.revokeObjectURL = () => {};
}
