import { useEffect, useState, useRef } from "react";

function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findZone(zones, coords) {
  if (!coords) return null;
  for (const z of zones) {
    const d = distanceMeters(
      coords.latitude,
      coords.longitude,
      z.center.lat,
      z.center.lng
    );
    if (d <= (z.radius_m || 50)) return z;
  }
  return null;
}

export default function App() {
  const [zones, setZones] = useState([]);
  const [coords, setCoords] = useState(null);
  const [zone, setZone] = useState(null);

  // true only after we successfully primed audio (persisted across reloads)
  const [audioPrimed, setAudioPrimed] = useState(() => {
    try {
      return localStorage.getItem("audioPrimed") === "1";
    } catch {
      return false;
    }
  });

  // transient flag while user clicked but priming not yet confirmed
  const [primingInProgress, setPrimingInProgress] = useState(false);

  const audioRef = useRef();

  // load zones
  useEffect(() => {
    fetch("/api/zones")
      .then((r) => r.json())
      .then(setZones)
      .catch((e) => {
        console.error("Failed to load zones:", e);
      });
  }, []);

  // geolocation watch
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      console.warn("Geolocation not supported in this browser.");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => setCoords(p.coords),
      (e) => console.error("geolocation error:", e),
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Update zone and load track (but don't force-play unless primed)
  useEffect(() => {
    const z = findZone(zones, coords);
    setZone(z);

    if (!z || !audioRef.current) return;

    const track = z.playlist && z.playlist[0];
    if (track) {
      // set src so audio element is ready
      audioRef.current.src = track;
    }

    // if audio was primed earlier, attempt to play automatically
    if (audioPrimed && track) {
      audioRef.current
        .play()
        .then(() => {
          // ok
        })
        .catch((err) => {
          console.warn("Auto-play attempt failed after priming:", err);
          // If this happens, we can clear persisted priming so UX shows the banner again.
          try {
            localStorage.removeItem("audioPrimed");
          } catch {}
          setAudioPrimed(false);
        });
    }
  }, [coords, zones, audioPrimed]);

  // Prime function: do a muted play->pause->unmute sequence and try audible play
  async function primeAudio() {
    const a = audioRef.current;
    if (!a) return false;

    const track = (zone && zone.playlist && zone.playlist[0]) || a.src || "";
    if (track) a.src = track;

    a.muted = true;
    try {
      await a.play(); // attempt muted play to prime buffering
      a.pause();
      a.currentTime = 0;
      a.muted = false;

      // try audible play once (may still fail in very strange cases)
      try {
        await a.play();
      } catch (e) {
        // audible play might fail, but priming still useful (unmuted)
        console.warn("audible play after priming failed:", e);
      }
      return true;
    } catch (err) {
      console.warn("Priming muted play failed:", err);
      // ensure audio not stuck muted
      a.muted = false;
      return false;
    }
  }

  // Called when user explicitly clicks Enable button or when global gesture fires
  async function handleUserEnable() {
    if (primingInProgress) return;
    setPrimingInProgress(true);

    const ok = await primeAudio();
    setPrimingInProgress(false);

    if (ok) {
      try {
        localStorage.setItem("audioPrimed", "1");
      } catch {}
      setAudioPrimed(true);
    } else {
      // Do not persist; let the user try again
      setAudioPrimed(false);
    }
  }

  // Global one-time gesture listener (click/touch/keydown anywhere)
  useEffect(() => {
    if (audioPrimed) return; // nothing to do

    const onGesture = async (e) => {
      // remove listeners immediately
      window.removeEventListener("click", onGesture, true);
      window.removeEventListener("touchstart", onGesture, true);
      window.removeEventListener("keydown", onGesture, true);

      // prime audio on that gesture
      await handleUserEnable();
    };

    window.addEventListener("click", onGesture, { capture: true, passive: true });
    window.addEventListener("touchstart", onGesture, { capture: true, passive: true });
    window.addEventListener("keydown", onGesture, { capture: true, passive: true });

    return () => {
      window.removeEventListener("click", onGesture, true);
      window.removeEventListener("touchstart", onGesture, true);
      window.removeEventListener("keydown", onGesture, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioPrimed, zone]); // re-run if zone changes (so priming can use current track)

  // Small debug helper: show helpful text if priming failed after many tries
  const showBanner = !audioPrimed;

  return (
    <div style={{ padding: 18, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ marginBottom: 8 }}>USC VibePlayer (Demo)</h1>

      <div style={{ marginBottom: 10 }}>
        <strong>Position:</strong>{" "}
        {coords ? `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}` : "waiting..."}
      </div>

      <div style={{ marginBottom: 12 }}>
        <strong>Current zone:</strong> {zone ? zone.name : "None"}
      </div>

      {/* visible banner & button until priming succeeds */}
      {showBanner && (
        <div
          style={{
            border: "1px solid #e6e6e6",
            padding: 12,
            borderRadius: 8,
            marginBottom: 14,
            background: "#fffef8",
            maxWidth: 720,
          }}
        >
          <div style={{ marginBottom: 8 }}>
            <strong>Enable ambient audio</strong>
          </div>
          <div style={{ color: "#444", marginBottom: 10 }}>
            Click anywhere on the page (or press the button) to allow automatic playback when you enter zones.
          </div>
          <div>
            <button
              onClick={handleUserEnable}
              disabled={primingInProgress}
              style={{
                padding: "10px 16px",
                fontSize: 15,
                background: "#0b63ff",
                color: "white",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              {primingInProgress ? "Enabling…" : "Enable Audio"}
            </button>
            <span style={{ marginLeft: 12, color: "#666", fontSize: 13 }}>
              (Or just click anywhere)
            </span>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <audio ref={audioRef} controls style={{ width: "100%", maxWidth: 720 }} />
      </div>

      <details style={{ maxWidth: 720 }}>
        <summary>Debug info</summary>
        <div style={{ marginTop: 8 }}>
          <div><strong>Zones loaded:</strong> {zones.length}</div>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, marginTop: 6 }}>
            {JSON.stringify(zones.map(z => ({ id: z.id, name: z.name, center: z.center, radius_m: z.radius_m })), null, 2)}
          </pre>
        </div>
      </details>
    </div>
  );
}