import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  MapPin,
  Navigation,
  Search,
  Accessibility,
  Volume2,
  VolumeX,
  AlertTriangle,
  Share2,
  Home,
  GraduationCap,
  ShieldCheck,
  PlusCircle,
} from 'lucide-react';
import type { UserSummary } from '@kamand/shared';
import { useMapStore } from '../store/useMapStore.js';
import { useChatStore } from '../store/useChatStore.js';
import { useCampusStore } from '../store/useCampusStore.js';
import {
  searchCampusPlacesOffline,
  shouldShowAccuracyFallbackBanner,
} from '../lib/campusMapEngine.js';
import {
  SPRING_SHEET,
  PointerVelocityTracker,
  projectMomentum,
  rubberband,
} from '../lib/physics.js';
import { FluidSheet } from './FluidSheet.js';

interface CampusMapViewProps {
  currentUser: UserSummary;
  onOpenChatWithEta?: () => void;
}

/**
 * Interactive IIT Mandi Campus Map & Offline A* Navigation View (Section 13 & Section 15):
 * - Interactive SVG/Canvas + OSM Vector Coordinate Map with animated walking route line,
 *   blue position dot + accuracy circle, and tappable pins that scale place sheets from the pin origin.
 * - Interruptible bottom sheet with spring snap points (`peek` / `half` / `full`) using
 *   velocity projection (`projectMomentum`) and progressive rubber-banding.
 * - Geolocation consent modal, >30m accuracy fallback banner ("I'm near…"), step-free toggle,
 *   voice guidance toggle, "Directions to my room" / "Directions to next class", and "Share my ETA".
 */
export const CampusMapView: React.FC<CampusMapViewProps> = ({
  currentUser,
  onOpenChatWithEta,
}) => {
  const {
    places,
    searchQuery,
    selectedPlace,
    fromPlaceId,
    toPlaceId,
    stepFreeOnly,
    voiceGuidanceEnabled,
    activeRoute,
    sheetSnap,
    hasLocationConsent,
    userCoords,
    campusPositionText,
    liveShareSession,
    loadMapBundle,
    setSearchQuery,
    setSelectedPlace,
    setRouteEndpoints,
    setStepFreeOnly,
    setVoiceGuidanceEnabled,
    setSheetSnap,
    grantLocationConsentAndStartWatch,
    stopLocationWatch,
    setManualLandmarkPosition,
    revokeLiveLocationShare,
    upsertAdminPlace,
  } = useMapStore();

  const { conversations, activeConversationId, sendMessage } = useChatStore();
  const today = useCampusStore((s) => s.today);

  const [isConsentModalOpen, setIsConsentModalOpen] = useState(false);
  const [isAdminEditorOpen, setIsAdminEditorOpen] = useState(false);
  const [etaSharedNotice, setEtaSharedNotice] = useState<string | null>(null);

  // Admin Map Editor state
  const [editCode, setEditCode] = useState('D-02');
  const [editName, setEditName] = useState('Hostel D-02 (North Campus)');
  const [editAliases, setEditAliases] = useState('D-02, D02, d 02, D block 2');
  const [editCategory, setEditCategory] = useState<
    'hostel' | 'academic' | 'mess' | 'library' | 'sports' | 'gate' | 'bus_stop' | 'hospital' | 'shop'
  >('hostel');
  const [editLat, setEditLat] = useState('31.7781');
  const [editLng, setEditLng] = useState('76.9878');

  // Bottom sheet gesture state
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const grabStartYRef = useRef<number | null>(null);
  const velocityTrackerRef = useRef(new PointerVelocityTracker());

  useEffect(() => {
    void loadMapBundle();
  }, [loadMapBundle]);

  const searchMatches = searchCampusPlacesOffline(searchQuery, places);
  const showAccuracyBanner =
    hasLocationConsent && shouldShowAccuracyFallbackBanner(userCoords?.accuracyMeters);

  const isAdminOrMod =
    currentUser.role === 'admin' ||
    currentUser.role === 'super_admin' ||
    currentUser.role === 'moderator';

  // Dynamic campus bounding box calculated from real coordinates across North & South campuses
  const campusBounds = React.useMemo(() => {
    if (!places || places.length === 0) {
      return { minLat: 31.7735, maxLat: 31.7850, minLng: 76.9830, maxLng: 76.9950 };
    }
    const lats = places.map((p) => p.lat);
    const lngs = places.map((p) => p.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const latSpan = Math.max(0.003, maxLat - minLat);
    const lngSpan = Math.max(0.003, maxLng - minLng);
    return {
      minLat: minLat - latSpan * 0.08,
      maxLat: maxLat + latSpan * 0.08,
      minLng: minLng - lngSpan * 0.08,
      maxLng: maxLng + lngSpan * 0.08,
    };
  }, [places]);

  // Project WGS84 lat/lng onto our interactive 800x480 campus viewport
  const projectToCanvas = (lat: number, lng: number) => {
    const { minLat, maxLat, minLng, maxLng } = campusBounds;
    const x = ((lng - minLng) / (maxLng - minLng)) * 680 + 60;
    const y = (1 - (lat - minLat) / (maxLat - minLat)) * 360 + 60;
    return {
      x: Math.max(40, Math.min(760, x)),
      y: Math.max(40, Math.min(440, y)),
    };
  };

  // Spring Snap-Point Bottom Sheet Heights
  const snapHeightMap: Record<'peek' | 'half' | 'full', number> = {
    peek: 148,
    half: 310,
    full: 500,
  };
  const currentBaseHeight = snapHeightMap[sheetSnap];

  const handleSheetPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    grabStartYRef.current = e.clientY;
    velocityTrackerRef.current.reset();
    velocityTrackerRef.current.addSample(e.clientX, e.clientY);
  };

  const handleSheetPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (grabStartYRef.current === null) return;
    velocityTrackerRef.current.addSample(e.clientX, e.clientY);
    const rawDelta = e.clientY - grabStartYRef.current;

    if (sheetSnap === 'full' && rawDelta < 0) {
      setDragOffsetY(rubberband(rawDelta, 180));
    } else if (sheetSnap === 'peek' && rawDelta > 0) {
      setDragOffsetY(rubberband(rawDelta, 180));
    } else {
      setDragOffsetY(rawDelta);
    }
  };

  const handleSheetPointerUp = () => {
    if (grabStartYRef.current === null) return;
    grabStartYRef.current = null;
    const { vy } = velocityTrackerRef.current.getVelocity();
    const projectedHeight = currentBaseHeight - (dragOffsetY + projectMomentum(vy, 0.995));
    setDragOffsetY(0);

    if (projectedHeight > 410) {
      setSheetSnap('full');
    } else if (projectedHeight > 220) {
      setSheetSnap('half');
    } else {
      setSheetSnap('peek');
    }
  };

  const handleRouteToMyRoom = () => {
    const roomCode = currentUser.roomCode || 'B-19';
    const matches = searchCampusPlacesOffline(roomCode, places);
    if (matches[0]) {
      setSelectedPlace(matches[0]);
      setRouteEndpoints(fromPlaceId, matches[0].id);
    }
  };

  const handleRouteToNextClass = () => {
    const nextClassRoom = today?.timetable[0]?.roomCode || 'A13-LH1';
    const matches = searchCampusPlacesOffline(nextClassRoom, places);
    if (matches[0]) {
      setSelectedPlace(matches[0]);
      setRouteEndpoints(fromPlaceId, matches[0].id);
    }
  };

  const handleShareEtaToChat = async () => {
    if (!activeRoute || !activeRoute.found) return;
    const targetConvId = activeConversationId ?? conversations[0]?.id;
    if (!targetConvId) return;

    const destName =
      places.find((p) => p.id === toPlaceId)?.canonicalName || 'destination';
    const etaMessage = `📍 Walking to ${destName} (${activeRoute.totalDistanceMeters} m · ETA ~${activeRoute.estimatedWalkMinutes} min walk${stepFreeOnly ? ', step-free route' : ''
      }).`;

    await sendMessage(targetConvId, etaMessage, currentUser);
    setEtaSharedNotice(`Shared ${activeRoute.estimatedWalkMinutes} min ETA to chat!`);
    setTimeout(() => setEtaSharedNotice(null), 3000);
    onOpenChatWithEta?.();
  };

  return (
    <div className="relative flex-1 flex flex-col h-full w-full bg-slate-950 overflow-hidden select-none">
      {/* Translucent Floating Top Map Search & Quick Actions Bar (§12 & §13) */}
      <div className="absolute top-3 left-3 right-3 z-20 flex flex-col gap-2 pointer-events-none">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 p-2.5 rounded-2xl glass-chrome glass-top-highlight border border-white/15 shadow-2xl">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder='Search "A-12", "b19", "c 10", "library", "mess"…'
              aria-label="Search campus map"
              className="w-full rounded-xl bg-slate-900/90 border border-white/15 pl-10 pr-3 py-2 text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-sky-500"
            />
          </div>

          <button
            type="button"
            onClick={handleRouteToMyRoom}
            className="fluid-press px-3 py-2 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/30 text-sky-200 text-xs font-semibold flex items-center gap-1.5"
          >
            <Home className="w-3.5 h-3.5" />
            <span>To My Room ({currentUser.roomCode || 'B-19'})</span>
          </button>

          <button
            type="button"
            onClick={handleRouteToNextClass}
            className="fluid-press px-3 py-2 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/30 text-indigo-200 text-xs font-semibold flex items-center gap-1.5"
          >
            <GraduationCap className="w-3.5 h-3.5" />
            <span>To Next Class</span>
          </button>

          <button
            type="button"
            onClick={() => setStepFreeOnly(!stepFreeOnly)}
            className={`fluid-press px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 ${stepFreeOnly
                ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200'
                : 'bg-slate-900 border-white/10 text-slate-300'
              }`}
            aria-pressed={stepFreeOnly}
          >
            <Accessibility className="w-3.5 h-3.5" />
            <span>Step-Free</span>
          </button>

          <button
            type="button"
            onClick={() => setVoiceGuidanceEnabled(!voiceGuidanceEnabled)}
            className="fluid-press p-2 rounded-xl bg-slate-900 border border-white/10 text-slate-300 hover:text-white"
            aria-label="Toggle voice guidance"
            title="Toggle Voice Guidance"
          >
            {voiceGuidanceEnabled ? (
              <Volume2 className="w-4 h-4 text-sky-400" />
            ) : (
              <VolumeX className="w-4 h-4" />
            )}
          </button>

          {!hasLocationConsent ? (
            <button
              type="button"
              onClick={() => setIsConsentModalOpen(true)}
              className="fluid-press px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>Locate Me</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={stopLocationWatch}
              className="fluid-press px-2.5 py-2 rounded-xl bg-rose-500/20 border border-rose-400/30 text-rose-200 text-xs"
            >
              Stop GPS
            </button>
          )}

          {isAdminOrMod && (
            <button
              type="button"
              onClick={() => setIsAdminEditorOpen(true)}
              className="fluid-press px-2.5 py-2 rounded-xl bg-amber-500/20 border border-amber-400/30 text-amber-200 text-xs font-semibold flex items-center gap-1"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Map Editor</span>
            </button>
          )}
        </div>

        {/* >30 m GPS Accuracy Fallback Banner ("I'm near…") (§13) */}
        {showAccuracyBanner && (
          <div
            role="alert"
            className="pointer-events-auto px-4 py-2.5 rounded-2xl bg-amber-950/90 border border-amber-400/40 text-amber-200 text-xs flex flex-wrap items-center justify-between gap-2 shadow-lg"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span>
                GPS accuracy is weak (~{userCoords?.accuracyMeters ?? 45} m). Tap{' '}
                <strong>“I’m near…”</strong> to pick your start landmark:
              </span>
            </div>
            <select
              value={fromPlaceId}
              onChange={(e) => setManualLandmarkPosition(e.target.value)}
              aria-label="I'm near landmark selector"
              className="rounded-xl bg-slate-900 border border-amber-400/40 px-2.5 py-1 text-xs text-white"
            >
              {places.map((p) => (
                <option key={p.id} value={p.id}>
                  I’m near {p.canonicalName}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Interactive Campus Vector Canvas (South Campus → Central Spine → North Campus) */}
      <div className="relative flex-1 w-full h-full bg-[#070d19] overflow-hidden flex items-center justify-center">
        <svg
          viewBox="0 0 800 480"
          className="w-full h-full object-contain"
          role="img"
          aria-label="IIT Mandi Interactive Campus Map"
        >
          <defs>
            <radialGradient id="campusGlow" cx="50%" cy="50%" r="55%">
              <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#020617" stopOpacity="0" />
            </radialGradient>
          </defs>

          <rect width="800" height="480" fill="url(#campusGlow)" />

          {/* Uhl River / Kamand Khad Stream Contour */}
          <path
            d="M 40 390 Q 260 320, 440 220 T 760 95"
            fill="none"
            stroke="#0284c7"
            strokeWidth="12"
            strokeOpacity="0.16"
            strokeLinecap="round"
          />

          {/* Campus Zone Labels */}
          <text x="95" y="425" fill="#475569" fontSize="11" fontWeight="700" letterSpacing="1.5">
            SOUTH CAMPUS
          </text>
          <text x="580" y="75" fill="#475569" fontSize="11" fontWeight="700" letterSpacing="1.5">
            NORTH CAMPUS
          </text>

          {/* Animated A* Route Line */}
          {activeRoute && activeRoute.found && activeRoute.places.length > 1 && (
            <motion.polyline
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.45 }}
              fill="none"
              stroke={stepFreeOnly ? '#10b981' : '#38bdf8'}
              strokeWidth="4.5"
              strokeDasharray={stepFreeOnly ? undefined : '8 4'}
              strokeLinecap="round"
              strokeLinejoin="round"
              points={activeRoute.places
                .map((p) => {
                  const pt = projectToCanvas(p.lat, p.lng);
                  return `${pt.x},${pt.y}`;
                })
                .join(' ')}
            />
          )}

          {/* User Blue Dot + Accuracy Circle (On-Device Only) */}
          {hasLocationConsent && userCoords && (
            <g>
              {(() => {
                const pt = projectToCanvas(userCoords.lat, userCoords.lng);
                return (
                  <>
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={Math.min(48, Math.max(14, userCoords.accuracyMeters * 0.7))}
                      fill="#38bdf8"
                      fillOpacity="0.16"
                      stroke="#38bdf8"
                      strokeOpacity="0.4"
                    />
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r="6"
                      fill="#0284c7"
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                  </>
                );
              })()}
            </g>
          )}

          {/* Campus Place Pins */}
          {places.map((place) => {
            const pt = projectToCanvas(place.lat, place.lng);
            const isSelected = selectedPlace?.id === place.id;
            const isInRoute = activeRoute?.nodeIds.includes(place.id) ?? false;

            return (
              <g
                key={place.id}
                transform={`translate(${pt.x}, ${pt.y})`}
                onClick={() => setSelectedPlace(place)}
                className="cursor-pointer"
                role="button"
                tabIndex={0}
                aria-label={`Select ${place.canonicalName}`}
              >
                <circle
                  r={isSelected ? 13 : isInRoute ? 10 : 8}
                  fill={
                    isSelected
                      ? '#0ea5e9'
                      : isInRoute
                        ? '#10b981'
                        : '#1e293b'
                  }
                  stroke="#f8fafc"
                  strokeWidth={isSelected ? 2.5 : 1.5}
                />
                <text
                  y={-15}
                  textAnchor="middle"
                  fill={isSelected ? '#38bdf8' : '#cbd5e1'}
                  fontSize="10"
                  fontWeight="700"
                >
                  {place.code}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Interruptible Spring Bottom Sheet with Peek / Half / Full Snap Points (§6, §9, §13, §15) */}
      <motion.div
        animate={{ height: Math.max(120, currentBaseHeight - dragOffsetY) }}
        transition={grabStartYRef.current !== null ? { duration: 0 } : SPRING_SHEET}
        className="relative z-20 w-full rounded-t-3xl glass-chrome glass-top-highlight border-t border-white/15 shadow-2xl flex flex-col overflow-hidden"
        aria-label="Campus navigation sheet"
      >
        {/* Drag Handle */}
        <div
          onPointerDown={handleSheetPointerDown}
          onPointerMove={handleSheetPointerMove}
          onPointerUp={handleSheetPointerUp}
          onPointerCancel={handleSheetPointerUp}
          className="pt-2.5 pb-2 px-6 cursor-grab active:cursor-grabbing flex flex-col items-center touch-none"
        >
          <div className="h-1.5 w-11 rounded-full bg-slate-400/40 mb-2" />
          <div className="w-full flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium text-slate-200">{campusPositionText}</span>
            <div className="flex items-center gap-1.5">
              {(['peek', 'half', 'full'] as const).map((snap) => (
                <button
                  key={snap}
                  type="button"
                  onClick={() => setSheetSnap(snap)}
                  className={`px-2 py-0.5 rounded text-[10px] uppercase font-semibold ${sheetSnap === snap
                      ? 'bg-sky-500/25 text-sky-300'
                      : 'bg-white/5 text-slate-400'
                    }`}
                >
                  {snap}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Sheet Body */}
        <div className="flex-1 overflow-y-auto px-6 pb-5 space-y-4">
          {/* Selected Place Details Card with Direct Google Maps Link */}
          {selectedPlace && (
            <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-sky-400/30 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-300 text-xs font-bold">
                    {selectedPlace.code}
                  </span>
                  <span className="text-sm font-semibold text-white">{selectedPlace.canonicalName}</span>
                </div>
                <div className="text-[11px] text-slate-400 flex items-center gap-2">
                  <span>GPS: {selectedPlace.lat.toFixed(5)}°N, {selectedPlace.lng.toFixed(5)}°E</span>
                  <span>·</span>
                  <span className="capitalize">{selectedPlace.category}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${selectedPlace.lat},${selectedPlace.lng}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="fluid-press px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-xs font-semibold text-slate-200 flex items-center gap-1.5"
                  title="View precise position on Google Maps"
                >
                  <MapPin className="w-3.5 h-3.5 text-rose-400" />
                  <span>Google Maps</span>
                </a>
                <button
                  type="button"
                  onClick={() => setRouteEndpoints(fromPlaceId, selectedPlace.id)}
                  className="fluid-press px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-xs font-semibold text-white cursor-pointer"
                >
                  Directions Here
                </button>
              </div>
            </div>
          )}

          {/* Manual "From: [place]" & "To: [place]" Route Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-center">
            <div>
              <label className="block text-[10px] uppercase font-semibold text-slate-400 mb-1">
                From Landmark
              </label>
              <select
                value={fromPlaceId}
                onChange={(e) => setRouteEndpoints(e.target.value, toPlaceId)}
                aria-label="From place"
                className="w-full rounded-xl bg-slate-900 border border-white/15 px-3 py-2 text-xs text-white"
              >
                {places.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {p.canonicalName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-semibold text-slate-400 mb-1">
                To Destination
              </label>
              <select
                value={toPlaceId}
                onChange={(e) => setRouteEndpoints(fromPlaceId, e.target.value)}
                aria-label="To destination"
                className="w-full rounded-xl bg-slate-900 border border-white/15 px-3 py-2 text-xs text-white"
              >
                {places.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {p.canonicalName}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end gap-2 pt-4 sm:pt-5">
              <button
                type="button"
                onClick={() => void handleShareEtaToChat()}
                className="fluid-press w-full py-2 px-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share My ETA</span>
              </button>
            </div>
          </div>

          {etaSharedNotice && (
            <p className="text-xs text-emerald-400 font-medium">{etaSharedNotice}</p>
          )}

          {liveShareSession && (
            <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-between text-xs text-emerald-200">
              <span>Time-limited live location sharing is active.</span>
              <button
                type="button"
                onClick={revokeLiveLocationShare}
                className="px-2.5 py-1 rounded bg-rose-500 text-white text-[11px] font-semibold"
              >
                Revoke Now
              </button>
            </div>
          )}

          {/* Selected Place & Turn-by-Turn Walking Route Summary */}
          {activeRoute && activeRoute.found ? (
            <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-sky-500/30 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-sky-400" />
                  <span className="text-sm font-bold text-white">
                    {activeRoute.totalDistanceMeters} m · ~{activeRoute.estimatedWalkMinutes} min
                    walk
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 text-[11px] font-semibold">
                  {activeRoute.stepFree ? 'Step-Free Accessible' : 'Includes Stairs'}
                </span>
              </div>

              {activeRoute.steps.length > 0 && (
                <ol className="space-y-1.5 text-xs text-slate-300 list-decimal list-inside">
                  {activeRoute.steps.map((step, idx) => (
                    <li key={idx} className="leading-relaxed">
                      <span className="font-medium text-white">{step.instruction}</span>{' '}
                      <span className="text-slate-400">({step.distanceMeters} m)</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ) : (
            <p className="text-xs text-amber-300">
              No walkable route found matching current constraints.
            </p>
          )}

          {/* Quick Matching Places Chips */}
          {searchQuery.trim() && (
            <div className="flex flex-wrap gap-1.5">
              {searchMatches.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setSelectedPlace(p);
                    setRouteEndpoints(fromPlaceId, p.id);
                  }}
                  className="fluid-press px-3 py-1.5 rounded-xl bg-slate-900 border border-white/15 text-xs text-sky-300 font-medium"
                >
                  {p.code} · {p.canonicalName}
                </button>
              ))}
            </div>
          )}
        </div>
      </motion.div>

      {/* Geolocation Explanation & Consent Modal (§13 Hard Rule) */}
      <FluidSheet
        isOpen={isConsentModalOpen}
        onClose={() => setIsConsentModalOpen(false)}
        title="On-Device Campus Location Consent"
      >
        <div className="space-y-4">
          <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-400/30 space-y-1.5 text-xs text-slate-200">
            <div className="font-semibold text-emerald-300 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              <span>Your location stays on your device:</span>
            </div>
            <ul className="list-disc list-inside text-[11px] text-slate-300 space-y-1">
              <li>
                `navigator.geolocation.watchPosition` is processed 100% locally in your browser to
                compute walking directions and nearest campus landmarks.
              </li>
              <li>Your coordinates are NEVER stored on the Kamand Chat server.</li>
              <li>
                If you choose to share live location or ETA with a contact, it is time-limited and
                revocable with one tap.
              </li>
            </ul>
          </div>

          <button
            type="button"
            onClick={() => {
              grantLocationConsentAndStartWatch();
              setIsConsentModalOpen(false);
            }}
            className="fluid-press w-full min-h-[44px] rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-semibold"
          >
            Consent & Enable On-Device GPS
          </button>
        </div>
      </FluidSheet>

      {/* Admin Map Pin & Alias Editor Sheet (§13) */}
      <FluidSheet
        isOpen={isAdminEditorOpen}
        onClose={() => setIsAdminEditorOpen(false)}
        title="Admin Campus Map Pin & Alias Editor"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await upsertAdminPlace({
              code: editCode,
              canonicalName: editName,
              aliases: editAliases
                .split(',')
                .map((a) => a.trim())
                .filter(Boolean),
              category: editCategory,
              lat: parseFloat(editLat),
              lng: parseFloat(editLng),
              entrances: ['Main Entrance'],
              notes: 'Verified via Admin Map Editor',
            });
            setIsAdminEditorOpen(false);
          }}
          className="space-y-3"
        >
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              required
              value={editCode}
              onChange={(e) => setEditCode(e.target.value)}
              placeholder="Code (e.g. D-02)"
              className="rounded-xl bg-slate-900 border border-white/15 px-3 py-2 text-xs text-white"
            />
            <select
              value={editCategory}
              onChange={(e) => setEditCategory(e.target.value as typeof editCategory)}
              className="rounded-xl bg-slate-900 border border-white/15 px-3 py-2 text-xs text-white"
            >
              <option value="hostel">Hostel</option>
              <option value="academic">Academic</option>
              <option value="mess">Mess</option>
              <option value="library">Library</option>
              <option value="sports">Sports</option>
              <option value="gate">Gate</option>
              <option value="hospital">Hospital</option>
              <option value="shop">Shop</option>
            </select>
          </div>
          <input
            type="text"
            required
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Canonical Name"
            className="w-full rounded-xl bg-slate-900 border border-white/15 px-3 py-2 text-xs text-white"
          />
          <input
            type="text"
            value={editAliases}
            onChange={(e) => setEditAliases(e.target.value)}
            placeholder="Comma-separated aliases"
            className="w-full rounded-xl bg-slate-900 border border-white/15 px-3 py-2 text-xs text-white"
          />
          <div className="space-y-1">
            <label className="block text-[10px] uppercase font-semibold text-sky-400">
              Quick Paste from Google Maps (e.g. 31.7812, 76.9921 or Maps URL)
            </label>
            <input
              type="text"
              placeholder="Paste Google Maps coordinates or link to auto-fill Lat/Lng"
              onChange={(e) => {
                const val = e.target.value.trim();
                const match = val.match(/([0-9]{2}\.[0-9]+)[,\s]+([0-9]{2}\.[0-9]+)/);
                if (match) {
                  setEditLat(match[1]!);
                  setEditLng(match[2]!);
                }
              }}
              className="w-full rounded-xl bg-slate-950 border border-sky-400/30 px-3 py-1.5 text-xs text-sky-200 placeholder:text-slate-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              step="any"
              required
              value={editLat}
              onChange={(e) => setEditLat(e.target.value)}
              placeholder="Latitude"
              className="rounded-xl bg-slate-900 border border-white/15 px-3 py-2 text-xs text-white"
            />
            <input
              type="number"
              step="any"
              required
              value={editLng}
              onChange={(e) => setEditLng(e.target.value)}
              placeholder="Longitude"
              className="rounded-xl bg-slate-900 border border-white/15 px-3 py-2 text-xs text-white"
            />
          </div>
          <button
            type="submit"
            className="fluid-press w-full py-2.5 rounded-xl bg-sky-500 text-white text-xs font-semibold"
          >
            Save Campus Pin
          </button>
        </form>
      </FluidSheet>
    </div>
  );
};
