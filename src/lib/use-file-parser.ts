"use client";
import { useState, useCallback } from "react";

export type ParsedFile = {
  filename: string;
  contentType: string;
  kind: string;
  rawSummary: string;
  textContent?: string;
  workloads?: {
    source: string;
    workloads: unknown[];
    totals: { count: number; cpu: number; ramGb: number; storageGb: number; osMix: Record<string, number> };
  };
  truncated: boolean;
  warnings: string[];
};

export function useFileParser() {
  const [parsedFiles, setParsedFiles] = useState<ParsedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const uploadFiles = useCallback(async (files: FileList | File[] | null) => {
    if (!files) return;
    const list = Array.from(files);
    if (list.length === 0) return;
    setErr(null);
    setUploading(true);
    try {
      const results = await Promise.all(
        list.map(async (file) => {
          const fd = new FormData();
          fd.append("file", file);
          const res = await fetch("/api/projects/extract/parse", { method: "POST", body: fd });
          const data = await res.json();
          if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "parse failed");
          return data as ParsedFile;
        }),
      );
      setParsedFiles((p) => [...p, ...results]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "upload failed");
    } finally {
      setUploading(false);
    }
  }, []);

  const removeFile = useCallback((idx: number) => {
    setParsedFiles((p) => p.filter((_, i) => i !== idx));
  }, []);

  return { parsedFiles, uploading, err, uploadFiles, removeFile, setErr };
}
