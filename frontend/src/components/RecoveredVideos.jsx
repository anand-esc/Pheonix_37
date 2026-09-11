import React, { useEffect, useRef, useState } from "react";
import {
  Play, Download, Loader2, FileVideo, Film, ChevronDown, ChevronUp,
  ShieldCheck, AlertTriangle, HardDrive,
} from "lucide-react";
import { streamFragment, downloadFragment, formatBytes } from "../api";

const METHOD_LABEL = {
  container_file_carve: "Recovered file",
  annexb_nal_carve: "Carved stream",
};

/** Everything the backend already stated, pulled out of the fragment record. */
function describe(fragment, index) {
  const size = Math.max(0, (fragment.byte_offset_end || 0) - (fragment.byte_offset_start || 0));
  const info = fragment.codec_info || "";
  const isFile = fragment.recovery_method === "container_file_carve";
  const resolution = info.match(/(\d{3,5}x\d{3,5})/)?.[1] || null;
  const duration = info.match(/@ ([\d.]+)s/)?.[1] || null;
  const codec = info.match(/(H\.26[45]|MPEG-4 Visual|Motion JPEG|AV1|VP9)/)?.[1] || null;
  const container = info.match(/^(MP4|AVI|MOV)/)?.[1] || null;
  const extension = container ? `.${container.toLowerCase()}` : ".h264";
  return {
    size,
    isFile,
    resolution,
    duration,
    codec,
    container,
    filename: `${fragment.fragment_id || `fragment-${index}`}${extension}`,
  };
}

function VideoCard({ caseId, fragment, index }) {
  const facts = describe(fragment, index);
  const [src, setSrc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showWhy, setShowWhy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const objectUrl = useRef(null);

  useEffect(
    () => () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      // The stream needs the operator header, so it is fetched rather than
      // handed to the element as a URL.
      const res = await streamFragment(caseId, index);
      const blob = await res.blob();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = URL.createObjectURL(blob);
      setSrc(objectUrl.current);
    } catch (err) {
      setError(err.message || "Could not load the recovered bytes");
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    setDownloading(true);
    setError(null);
    try {
      await downloadFragment(caseId, index, facts.filename);
    } catch (err) {
      setError(err.message || "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const confidence = Math.round((fragment.confidence_score || 0) * 100);
  const strong = confidence >= 70;

  return (
    <div className="bg-white border border-phx-border rounded-lg shadow-sm overflow-hidden flex flex-col">
      <div className="relative bg-black aspect-video flex items-center justify-center">
        {src ? (
          <video src={src} controls className="w-full h-full" preload="metadata" />
        ) : (
          <button
            onClick={load}
            disabled={loading}
            className="flex flex-col items-center gap-2 text-white/80 hover:text-white transition-colors"
          >
            {loading ? (
              <>
                <Loader2 size={32} className="animate-spin" />
                <span className="text-xs">Loading recovered bytes...</span>
              </>
            ) : (
              <>
                <div className="w-14 h-14 rounded-full bg-white/10 border border-white/30 flex items-center justify-center">
                  <Play size={24} />
                </div>
                <span className="text-xs font-medium">Play recovered video</span>
              </>
            )}
          </button>
        )}
        <span
          className={`absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
            facts.isFile
              ? "bg-emerald-500/90 text-white"
              : "bg-amber-500/90 text-white"
          }`}
        >
          {METHOD_LABEL[fragment.recovery_method] || fragment.recovery_method}
        </span>
      </div>

      <div className="p-4 flex flex-col gap-3 flex-1">
        <div>
          <div className="font-mono text-xs font-semibold text-phx-red break-all">
            {fragment.fragment_id}
          </div>
          <div className="text-[11px] text-phx-secondary mt-1">
            {[
              facts.container || facts.codec,
              facts.resolution,
              facts.duration ? `${facts.duration}s` : null,
              formatBytes(facts.size),
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>

        <div className="text-[10px] font-mono text-phx-muted flex items-center gap-1.5">
          <HardDrive size={11} />
          bytes {fragment.byte_offset_start?.toLocaleString()} –{" "}
          {fragment.byte_offset_end?.toLocaleString()} of the image
        </div>

        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 bg-phx-border rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${strong ? "bg-emerald-500" : "bg-amber-500"}`}
              style={{ width: `${confidence}%` }}
            />
          </div>
          <span className="font-mono text-[10px] font-bold text-phx-secondary">
            {confidence}%
          </span>
          {strong ? (
            <ShieldCheck size={13} className="text-emerald-600" />
          ) : (
            <AlertTriangle size={13} className="text-amber-600" />
          )}
        </div>

        <button
          onClick={() => setShowWhy((v) => !v)}
          className="flex items-center gap-1 text-[11px] text-phx-secondary hover:text-phx-primary transition-colors self-start"
        >
          {showWhy ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          Why this score
        </button>
        {showWhy && (
          <p className="text-[10px] font-mono text-phx-secondary bg-phx-surface border border-phx-border rounded p-2 leading-relaxed">
            {fragment.confidence_rationale}
          </p>
        )}

        {error && (
          <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded p-2">
            {error}
          </p>
        )}

        <div className="mt-auto pt-2 flex gap-2">
          <button onClick={save} disabled={downloading} className="btn-secondary text-xs flex-1 disabled:opacity-50">
            {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            <span>Save file</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The recovered exhibits for a case: every file and stream the carver pulled
 * out of the image, playable and downloadable from here.
 */
export function RecoveredVideos({ caseId, fragments }) {
  if (!fragments || fragments.length === 0) {
    return (
      <div className="bg-white border border-phx-border rounded-lg p-12 text-center">
        <Film size={40} className="text-phx-muted mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-phx-primary mb-2">Nothing recovered yet</h3>
        <p className="text-sm text-phx-secondary">
          Run the acquisition pipeline on a disk image or a video file to recover exhibits.
        </p>
      </div>
    );
  }

  const files = fragments.filter((f) => f.recovery_method === "container_file_carve");
  const streams = fragments.length - files.length;
  const totalBytes = fragments.reduce(
    (sum, f) => sum + Math.max(0, (f.byte_offset_end || 0) - (f.byte_offset_start || 0)),
    0,
  );

  return (
    <div className="space-y-4">
      <div className="bg-white border border-phx-border rounded-lg px-5 py-4 flex flex-wrap items-center gap-x-8 gap-y-3 shadow-sm">
        <div className="flex items-center gap-2">
          <FileVideo size={18} className="text-phx-red" />
          <span className="text-sm font-semibold text-phx-primary">
            {fragments.length} recovered {fragments.length === 1 ? "exhibit" : "exhibits"}
          </span>
        </div>
        <span className="text-xs text-phx-secondary">
          {files.length} whole file{files.length === 1 ? "" : "s"} · {streams} carved
          stream{streams === 1 ? "" : "s"}
        </span>
        <span className="text-xs text-phx-secondary">{formatBytes(totalBytes)} total</span>
        <span className="text-[11px] text-phx-muted ml-auto">
          Each file is served from the case vault exactly as it was carved; its hash is
          recorded in the custody facts.
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {fragments.map((fragment, index) => (
          <VideoCard
            key={fragment.fragment_id || index}
            caseId={caseId}
            fragment={fragment}
            index={index}
          />
        ))}
      </div>
    </div>
  );
}
