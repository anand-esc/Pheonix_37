import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, Loader2, AlertCircle } from "lucide-react";
import { streamFragment, getCase, getCaseFragments } from "../api";
import CaseHeader from "../components/phoenix-ui-kit/CaseHeader";

export function VideoViewer() {
  const { id, fragmentIdx } = useParams();
  const fragmentIndex = parseInt(fragmentIdx, 10);
  const navigate = useNavigate();

  const [caseData, setCaseData] = useState(null);
  const [fragments, setFragments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [videoSrc, setVideoSrc] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [error, setError] = useState(null);
  const [buffered, setBuffered] = useState({ start: 0, end: 0 });

  const videoRef = useRef(null);
  const objectUrlRef = useRef(null);

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
        setIsLoading(true);
        const [c, frags] = await Promise.all([getCase(id), getCaseFragments(id)]);
        if (isMounted) {
          setCaseData(c);
          setFragments(frags || []);
        }
      } catch (err) {
        console.error("Failed to load case data", err);
        if (isMounted) setError("Failed to load case data");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    loadData();
    return () => { isMounted = false; };
  }, [id]);

  useEffect(() => {
    if (isNaN(fragmentIndex) || !fragments.length) return;

    const fragment = fragments[fragmentIndex];
    if (!fragment) return;

    const loadStream = async () => {
      try {
        setError(null);
        const res = await streamFragment(id, fragmentIndex);
        const blob = await res.blob();
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        setVideoSrc(url);
      } catch (err) {
        console.error("Failed to load fragment stream", err);
        setError("Failed to load video stream. The backend may not support Range requests for this fragment.");
      }
    };
    loadStream();

    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [id, fragmentIndex, fragments]);

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
      const buffered = videoRef.current.buffered;
      if (buffered.length > 0) {
        // after a seek there can be several disjoint ranges; report the furthest
        setBuffered({ start: buffered.start(0), end: buffered.end(buffered.length - 1) });
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) setDuration(videoRef.current.duration);
  };

  const handleProgress = () => {
    if (videoRef.current) {
      const buffered = videoRef.current.buffered;
      if (buffered.length > 0) {
        setBuffered({ start: buffered.start(0), end: buffered.end(buffered.length - 1) });
      }
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch(() => {});
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e) => {
    if (!videoRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    videoRef.current.currentTime = pos * duration;
  };

  const handleVolumeChange = (e) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (videoRef.current) videoRef.current.volume = v;
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const toggleFullscreen = async () => {
    if (!videoRef.current) return;
    try {
      if (!isFullscreen) {
        await videoRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
      setIsFullscreen(!isFullscreen);
    } catch (err) {
      console.error("Fullscreen error", err);
    }
  };

  const handleKeyDown = (e) => {
    if (!videoRef.current) return;
    switch (e.key) {
      case " ":
      case "k":
        e.preventDefault();
        togglePlay();
        break;
      case "ArrowLeft":
        e.preventDefault();
        videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
        break;
      case "ArrowRight":
        e.preventDefault();
        videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 10);
        break;
      case "ArrowUp":
        e.preventDefault();
        setVolume(Math.min(1, volume + 0.1));
        break;
      case "ArrowDown":
        e.preventDefault();
        setVolume(Math.max(0, volume - 0.1));
        break;
      case "m":
        toggleMute();
        break;
      case "f":
        toggleFullscreen();
        break;
    }
  };

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying, volume, isMuted, duration]);

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return "00:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const currentFragment = fragments[fragmentIndex];

  if (isLoading) {
    return (
      <div className="phx-page" style={{ background: "var(--color-phx-deep)", minHeight: "100vh" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <Loader2 className="phx-spinner" size={32} style={{ color: "var(--color-phx-cyan)" }} />
            <span style={{ fontFamily: "var(--phx-font-mono)", fontSize: "0.78rem", color: "var(--color-phx-muted)" }}>
              LOADING CASE DATA...
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="phx-page" style={{ background: "var(--color-phx-deep)", minHeight: "100vh", padding: "2rem" }}>
        <CaseHeader
          caseId={caseData?.id || id}
          title={caseData?.name || "Video Fragment Viewer"}
          status="tampered"
          statusLabel="Stream error"
        />
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "2rem 1.5rem" }}>
          <div style={{
            background: "var(--color-phx-red)",
            border: "1px solid var(--color-phx-red)",
            borderRadius: "0.5rem",
            padding: "1.5rem",
            display: "flex",
            alignItems: "flex-start",
            gap: 12
          }}>
            <AlertCircle size={24} style={{ color: "var(--color-phx-red)", flexShrink: 0 }} />
            <div>
              <h3 style={{ fontFamily: "var(--phx-font-serif)", fontSize: "1rem", color: "var(--color-phx-red)", marginBottom: 4 }}>
                Playback Error
              </h3>
              <p style={{ fontFamily: "var(--phx-font-sans)", fontSize: "0.82rem", color: "var(--color-phx-primary)" }}>
                {error}
              </p>
              <button
                onClick={() => navigate(`/cases/${id}`)}
                style={{
                  marginTop: 12,
                  padding: "8px 16px",
                  background: "var(--color-phx-cyan)",
                  color: "var(--color-phx-deep)",
                  border: "none",
                  borderRadius: "0.5rem",
                  fontFamily: "var(--phx-font-sans)",
                  fontSize: "0.78rem",
                  cursor: "pointer"
                }}
              >
                Back to Case Detail
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="phx-page" style={{ background: "var(--color-phx-deep)", minHeight: "100vh" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "1.5rem" }}>
        <CaseHeader
          caseId={caseData?.id || id}
          title={caseData?.name || `Case ${id}`}
          status={caseData?.status === "Recovered" || caseData?.status === "Reported" ? "validated" : "pending"}
          statusLabel={caseData?.status}
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "1.5rem" }}>
          <div className="phx-video-panel" style={{
            background: "var(--color-phx-panel)",
            border: "1px solid var(--color-phx-border)",
            borderRadius: "0.5rem",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column"
          }}>
            <div style={{ position: "relative", background: "#000", minHeight: 400 }}>
              <video
                ref={videoRef}
                src={videoSrc}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onProgress={handleProgress}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onError={() => setError("Video playback failed. The stream may be corrupted or unsupported.")}
                style={{ width: "100%", height: "100%", display: "block" }}
                controls={false}
                crossOrigin="anonymous"
              />
              {!videoSrc && (
                <div style={{
                  position: "absolute", inset: 0, display: "flex",
                  flexDirection: "column", alignItems: "center", justifyContent: "center",
                  gap: 12, color: "#888", fontFamily: "var(--phx-font-sans)", fontSize: "0.875rem"
                }}>
                  <Loader2 className="phx-spinner" size={32} />
                  <span>Loading video stream...</span>
                </div>
              )}
            </div>

            <div className="phx-video-controls" style={{
              padding: "12px 16px",
              borderTop: "1px solid var(--color-phx-border)",
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap"
            }}>
              <button
                onClick={togglePlay}
                aria-label={isPlaying ? "Pause" : "Play"}
                style={{
                  background: "transparent", border: "none", cursor: "pointer",
                  padding: 4, display: "flex", alignItems: "center", justifyContent: "center",
                  color: "var(--color-phx-primary)"
                }}
              >
                {isPlaying ? <Pause size={24} stroke={2} /> : <Play size={24} stroke={2} />}
              </button>

              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span style={{ fontFamily: "var(--phx-font-mono)", fontSize: "0.75rem", color: "var(--color-phx-secondary)", minWidth: 55 }}>
                  {formatTime(currentTime)}
                </span>
                <div style={{ flex: 1, height: 4, background: "var(--color-phx-border)", borderRadius: 2, cursor: "pointer", position: "relative", overflow: "hidden" }} onClick={handleSeek}>
                  {buffered.end > 0 && (
                    <div style={{
                      position: "absolute", left: 0, top: 0, bottom: 0,
                      width: `${(buffered.end / duration) * 100}%`,
                      background: "rgba(201,162,39,0.3)", borderRadius: 2
                    }} />
                  )}
                  <div style={{
                    position: "absolute", left: 0, top: 0, bottom: 0,
                    width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                    background: "var(--color-phx-amber)", borderRadius: 2
                  }} />
                </div>
                <span style={{ fontFamily: "var(--phx-font-mono)", fontSize: "0.75rem", color: "var(--color-phx-secondary)", minWidth: 55, textAlign: "right" }}>
                  {formatTime(duration)}
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  onClick={toggleMute}
                  aria-label={isMuted ? "Unmute" : "Mute"}
                  style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, color: "var(--color-phx-primary)" }}
                >
                  {isMuted || volume === 0 ? <VolumeX size={20} stroke={2} /> : <Volume2 size={20} stroke={2} />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={volume}
                  onChange={handleVolumeChange}
                  style={{ width: 80, accentColor: "var(--color-phx-amber)" }}
                />
              </div>

              <button
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, color: "var(--color-phx-secondary)" }}
              >
                {isFullscreen ? <Minimize size={20} stroke={2} /> : <Maximize size={20} stroke={2} />}
              </button>
            </div>
          </div>

          <div className="phx-video-sidebar" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{
              background: "var(--color-phx-panel)",
              border: "1px solid var(--color-phx-border)",
              borderRadius: "0.5rem",
              padding: "1rem"
            }}>
              <div style={{
                fontFamily: "var(--phx-font-sans)",
                fontSize: "0.8rem",
                color: "var(--color-phx-secondary)",
                marginBottom: 8
              }}>FRAGMENT DETAIL</div>
              {currentFragment && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div>
                    <span style={{ fontFamily: "var(--phx-font-mono)", fontSize: "0.75rem", color: "var(--color-phx-muted)" }}>ID</span>
                    <div style={{ fontFamily: "var(--phx-font-mono)", fontSize: "0.82rem", color: "var(--color-phx-primary)", wordBreak: "break-all" }}>
                      {currentFragment.fragment_id || `frag-${fragmentIndex}`}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontFamily: "var(--phx-font-mono)", fontSize: "0.75rem", color: "var(--color-phx-muted)" }}>CODEC</span>
                    <div style={{ fontFamily: "var(--phx-font-sans)", fontSize: "0.82rem", color: "var(--color-phx-primary)" }}>
                      {currentFragment.codec_info || "Unknown"}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontFamily: "var(--phx-font-mono)", fontSize: "0.75rem", color: "var(--color-phx-muted)" }}>BYTE RANGE</span>
                    <div style={{ fontFamily: "var(--phx-font-mono)", fontSize: "0.82rem", color: "var(--color-phx-primary)" }}>
                      {currentFragment.byte_offset_start || 0} – {currentFragment.byte_offset_end || 0}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontFamily: "var(--phx-font-mono)", fontSize: "0.75rem", color: "var(--color-phx-muted)" }}>RECOVERY METHOD</span>
                    <div style={{ fontFamily: "var(--phx-font-sans)", fontSize: "0.82rem", color: "var(--color-phx-primary)" }}>
                      {currentFragment.recovery_method || "Unknown"}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontFamily: "var(--phx-font-mono)", fontSize: "0.75rem", color: "var(--color-phx-muted)" }}>CONFIDENCE</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 4, background: "var(--color-phx-border)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{
                          height: "100%",
                          width: `${Math.round((currentFragment.confidence_score || 0) * 100)}%`,
                          background: "var(--color-phx-amber)"
                        }} />
                      </div>
                      <span style={{
                        fontFamily: "var(--phx-font-mono)",
                        fontSize: "0.75rem",
                        color: "var(--color-phx-secondary)",
                        minWidth: 35,
                        textAlign: "right"
                      }}>
                        {Math.round((currentFragment.confidence_score || 0) * 100)}%
                      </span>
                    </div>
                  </div>
                  {currentFragment.confidence_rationale && (
                    <div>
                      <span style={{ fontFamily: "var(--phx-font-mono)", fontSize: "0.75rem", color: "var(--color-phx-muted)" }}>RATIONALE</span>
                      <div style={{
                        fontFamily: "var(--phx-font-sans)",
                        fontSize: "0.75rem",
                        color: "var(--color-phx-secondary)",
                        marginTop: 4,
                        lineHeight: 1.4
                      }}>
                        {currentFragment.confidence_rationale}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{
              background: "var(--color-phx-panel)",
              border: "1px solid var(--color-phx-border)",
              borderRadius: "0.5rem",
              padding: "1rem"
            }}>
              <div style={{
                fontFamily: "var(--phx-font-sans)",
                fontSize: "0.8rem",
                color: "var(--color-phx-secondary)",
                marginBottom: 8
              }}>ALL FRAGMENTS</div>
              <div style={{ maxHeight: 300, overflow: "auto" }}>
                {fragments.map((frag, idx) => (
                  <button
                    key={frag.fragment_id || idx}
                    onClick={() => navigate(`/cases/${id}/video/${idx}`)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 12px",
                      marginBottom: 4,
                      background: idx === fragmentIndex ? "var(--color-phx-cyan)" : "transparent",
                      border: idx === fragmentIndex ? "1px solid var(--color-phx-cyan)" : "1px solid transparent",
                      borderRadius: "0.25rem",
                      cursor: "pointer",
                      transition: "all 0.15s ease"
                    }}
                    onMouseEnter={(e) => e.target.style.background = idx === fragmentIndex ? "var(--color-phx-cyan)" : "var(--color-phx-cyan)"}
                    onMouseLeave={(e) => e.target.style.background = idx === fragmentIndex ? "var(--color-phx-cyan)" : "transparent"}
                  >
                    <div style={{ fontFamily: "var(--phx-font-mono)", fontSize: "0.72rem", color: idx === fragmentIndex ? "var(--color-phx-cyan)" : "var(--color-phx-primary)" }}>
                      {frag.fragment_id || `frag-${idx}`}
                    </div>
                    <div style={{ fontFamily: "var(--phx-font-sans)", fontSize: "0.7rem", color: "var(--color-phx-muted)", marginTop: 2 }}>
                      {frag.codec_info || "Unknown"} • {Math.round((frag.confidence_score || 0) * 100)}%
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .phx-spinner {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .phx-video-panel video::-webkit-media-controls {
          display: none !important;
        }
      `}</style>
    </div>
  );
}