const BY_EXTENSION: Record<string, string> = {
  csv: "text/csv",
  md: "text/markdown",
  markdown: "text/markdown",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export const uploadContentType = (file: File) =>
  BY_EXTENSION[file.name.split(".").pop()?.toLowerCase() ?? ""] ?? (file.type || "application/octet-stream");
