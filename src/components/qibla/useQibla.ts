import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';
import * as Location from 'expo-location';
import { logger } from '../../lib/logger';
import { AT_KAABA_KM, Coords, distanceKm, placeName, qiblaBearing } from '../../lib/qibla';

/** Accuracy (0–3, both platforms) at or below which the compass needs calibrating. */
export const CALIBRATE_AT = 1;
/** ...for at least this long, so a passing wobble doesn't flash the hint. */
export const CALIBRATE_AFTER_MS = 1000;
/** Readings are smoothed: each new one moves this share of the way. */
const SMOOTHING = 0.3;
/** Position from earlier is good enough to start with (it's refined at once). */
const LAST_KNOWN_MAX_AGE_MS = 30 * 60 * 1000;

export type QiblaStatus =
  | 'checking' // permission being read
  | 'needs-permission' // not asked yet (or can be asked again)
  | 'denied' // refused, and iOS won't ask again: Settings
  | 'locating' // allowed, no position yet
  | 'no-location' // allowed, but no position came
  | 'ready';

export type HeadingState =
  | { kind: 'waiting' } // no reading yet, or no true heading yet (trueHeading −1)
  | { kind: 'unavailable' } // no compass, or it failed: show the bearing as text
  | { kind: 'live'; heading: number; accuracy: number };

export interface QiblaReading {
  status: QiblaStatus;
  /** Degrees from true north to the Kaaba. */
  bearing: number | null;
  distanceKm: number | null;
  /** "London, United Kingdom"; null if no listed city is near. */
  place: string | null;
  /** Within a few hundred metres of the Kaaba: no direction to show. */
  atKaaba: boolean;
  heading: HeadingState;
  /** The compass has been inaccurate for a moment: ask for a figure 8. */
  calibrating: boolean;
  allow: () => void;
  openSettings: () => void;
  retry: () => void;
}

/** Average two angles on the circle (no jump at 359° → 0°). */
export function smoothHeading(previous: number | null, next: number, share = SMOOTHING): number {
  if (previous == null) return next;
  const r = (d: number) => (d * Math.PI) / 180;
  const x = Math.cos(r(previous)) * (1 - share) + Math.cos(r(next)) * share;
  const y = Math.sin(r(previous)) * (1 - share) + Math.sin(r(next)) * share;
  const d = (Math.atan2(y, x) * 180) / Math.PI;
  return d < 0 ? d + 360 : d;
}

/**
 * Where the Qibla is from here, for the compass sheet. Reads the permission
 * when opened; with it, the position (the last known one at once, then a fresh
 * one) and, while the sheet is open and the app in front, the compass's true
 * heading. Nothing is stored, sent or logged: positions and headings stay in
 * this hook's state.
 */
export function useQibla(open: boolean): QiblaReading {
  const [status, setStatus] = useState<QiblaStatus>('checking');
  const [coords, setCoords] = useState<Coords | null>(null);
  const [heading, setHeading] = useState<HeadingState>({ kind: 'waiting' });
  const [calibrating, setCalibrating] = useState(false);
  // In front unless iOS says otherwise ('unknown' at start counts as in front).
  const [active, setActive] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const smoothed = useRef<number | null>(null);
  const lowSince = useRef<number | null>(null);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);

  const locate = useCallback(async () => {
    setStatus((s) => (s === 'ready' ? s : 'locating'));
    let found = false;
    try {
      const last = await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS });
      if (last && live.current) {
        setCoords({ latitude: last.coords.latitude, longitude: last.coords.longitude });
        setStatus('ready');
        found = true;
      }
    } catch {
      // A fresh position follows.
    }
    try {
      const now = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (live.current) {
        setCoords({ latitude: now.coords.latitude, longitude: now.coords.longitude });
        setStatus('ready');
      }
    } catch {
      // Never the position itself in the log.
      logger.warn('Qibla: no current position');
      if (!found && live.current) setStatus('no-location');
    }
  }, []);

  const fromPermission = useCallback(
    (p: { granted: boolean; canAskAgain: boolean; status: string }) => {
      if (p.granted) {
        locate();
      } else if (!p.canAskAgain) {
        setStatus('denied');
      } else {
        setStatus('needs-permission');
      }
    },
    [locate],
  );

  // Each time it opens: what's allowed now (it may have changed in Settings).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStatus((s) => (s === 'ready' ? s : 'checking'));
    Location.getForegroundPermissionsAsync()
      .then((p) => {
        if (!cancelled) fromPermission(p);
      })
      .catch(() => {
        if (!cancelled) setStatus('needs-permission');
      });
    return () => {
      cancelled = true;
    };
  }, [open, fromPermission]);

  const allow = useCallback(() => {
    Location.requestForegroundPermissionsAsync()
      .then(fromPermission)
      .catch(() => setStatus('needs-permission'));
  }, [fromPermission]);

  const openSettings = useCallback(() => {
    Linking.openSettings().catch(() => undefined);
  }, []);

  // The compass, only while it's shown.
  const watching = open && active && status === 'ready';
  useEffect(() => {
    if (!watching) return;
    let sub: { remove: () => void } | null = null;
    let cancelled = false;
    smoothed.current = null;
    lowSince.current = null;
    setHeading({ kind: 'waiting' });
    setCalibrating(false);
    Location.watchHeadingAsync(
      (h) => {
        if (cancelled) return;
        // Calibration: inaccurate for a moment, not just once.
        const now = Date.now();
        if (h.accuracy <= CALIBRATE_AT) {
          if (lowSince.current == null) lowSince.current = now;
          setCalibrating(now - lowSince.current >= CALIBRATE_AFTER_MS);
        } else {
          lowSince.current = null;
          setCalibrating(false);
        }
        // True north only: magnetic north is off by up to tens of degrees.
        if (!(h.trueHeading >= 0)) {
          setHeading((s) => (s.kind === 'live' ? s : { kind: 'waiting' }));
          return;
        }
        smoothed.current = smoothHeading(smoothed.current, h.trueHeading);
        setHeading({ kind: 'live', heading: smoothed.current, accuracy: h.accuracy });
      },
      () => {
        if (!cancelled) setHeading({ kind: 'unavailable' });
      },
    )
      .then((s) => {
        if (cancelled) s.remove();
        else sub = s;
      })
      .catch(() => {
        if (!cancelled) setHeading({ kind: 'unavailable' });
      });
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [watching]);

  const bearing = coords ? qiblaBearing(coords) : null;
  const km = coords ? distanceKm(coords) : null;
  return {
    status,
    bearing,
    distanceKm: km,
    place: coords ? placeName(coords) : null,
    atKaaba: km != null && km < AT_KAABA_KM,
    heading,
    calibrating,
    allow,
    openSettings,
    retry: locate,
  };
}
