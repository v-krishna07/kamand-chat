import { create } from 'zustand';
import type {
  CampusPlaceDTO,
  CampusPathEdge,
  UpsertCampusPlaceInput,
} from '@kamand/shared';
import { apiFetch } from '../lib/api.js';
import {
  resolvePlaceByQuery,
  computeCampusWalkingRouteAStar,
  describePositionInCampusLanguage,
  type ComputedWalkingRoute,
} from '../lib/campusMapEngine.js';

const OFFLINE_MAP_BUNDLE_KEY = 'kamand_offline_map_bundle_v1';

interface LiveLocationShareSession {
  conversationId: string;
  expiresAtMs: number;
}

interface MapState {
  places: CampusPlaceDTO[];
  edges: CampusPathEdge[];
  searchQuery: string;
  selectedPlace: CampusPlaceDTO | null;
  fromPlaceId: string;
  toPlaceId: string;
  stepFreeOnly: boolean;
  voiceGuidanceEnabled: boolean;
  activeRoute: ComputedWalkingRoute | null;
  sheetSnap: 'peek' | 'half' | 'full';

  // On-device Geolocation State (NEVER sent to server unless live sharing is explicitly active)
  hasLocationConsent: boolean;
  userCoords: { lat: number; lng: number; accuracyMeters: number } | null;
  campusPositionText: string;
  liveShareSession: LiveLocationShareSession | null;

  loadMapBundle: () => Promise<void>;
  setSearchQuery: (query: string) => void;
  selectPlaceByCodeOrQuery: (codeOrQuery: string) => CampusPlaceDTO | null;
  setSelectedPlace: (place: CampusPlaceDTO | null) => void;
  setRouteEndpoints: (fromPlaceId: string, toPlaceId: string) => void;
  setStepFreeOnly: (stepFreeOnly: boolean) => void;
  setVoiceGuidanceEnabled: (enabled: boolean) => void;
  setSheetSnap: (snap: 'peek' | 'half' | 'full') => void;
  grantLocationConsentAndStartWatch: () => void;
  stopLocationWatch: () => void;
  setManualLandmarkPosition: (placeId: string) => void;
  startLiveLocationShare: (conversationId: string, durationMinutes?: number) => void;
  revokeLiveLocationShare: () => void;
  upsertAdminPlace: (input: UpsertCampusPlaceInput) => Promise<void>;
}

let geoWatchId: number | null = null;

export const useMapStore = create<MapState>((set, get) => {
  const recalculateRoute = (
    fromId: string,
    toId: string,
    stepFree: boolean,
    places = get().places,
    edges = get().edges
  ) => {
    if (!fromId || !toId || places.length === 0) {
      set({ activeRoute: null });
      return;
    }
    const route = computeCampusWalkingRouteAStar({
      startPlaceId: fromId,
      goalPlaceId: toId,
      places,
      edges,
      stepFreeOnly: stepFree,
    });
    set({ activeRoute: route });

    if (route.found && get().voiceGuidanceEnabled && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const firstStep = route.steps[0]?.instruction || `Route ready to ${toId}`;
        const utter = new SpeechSynthesisUtterance(
          `Walking route ready: ${route.totalDistanceMeters} meters, about ${route.estimatedWalkMinutes} minutes. ${firstStep}`
        );
        window.speechSynthesis.speak(utter);
      } catch {
        // Ignore speech synthesis errors in headless browsers
      }
    }
  };

  return {
    places: [],
    edges: [],
    searchQuery: '',
    selectedPlace: null,
    fromPlaceId: 'place-b19',
    toPlaceId: 'place-a13-lh1',
    stepFreeOnly: false,
    voiceGuidanceEnabled: false,
    activeRoute: null,
    sheetSnap: 'half',
    hasLocationConsent: false,
    userCoords: null,
    campusPositionText: 'Near Central Library · IIT Mandi',
    liveShareSession: null,

    loadMapBundle: async () => {
      try {
        const res = await apiFetch<{
          places: CampusPlaceDTO[];
          edges: CampusPathEdge[];
        }>('/api/map/bundle');
        try {
          localStorage.setItem(OFFLINE_MAP_BUNDLE_KEY, JSON.stringify(res));
        } catch {
          // Ignore quota errors
        }
        const selected = get().selectedPlace ?? res.places.find((p) => p.code === 'B-19') ?? res.places[0] ?? null;
        set({
          places: res.places,
          edges: res.edges,
          selectedPlace: selected,
        });
        recalculateRoute(
          get().fromPlaceId,
          get().toPlaceId,
          get().stepFreeOnly,
          res.places,
          res.edges
        );
      } catch {
        // Offline PWA Fallback: load from localStorage cache
        try {
          const cached = localStorage.getItem(OFFLINE_MAP_BUNDLE_KEY);
          if (cached) {
            const parsed = JSON.parse(cached) as {
              places: CampusPlaceDTO[];
              edges: CampusPathEdge[];
            };
            set({ places: parsed.places, edges: parsed.edges });
            recalculateRoute(
              get().fromPlaceId,
              get().toPlaceId,
              get().stepFreeOnly,
              parsed.places,
              parsed.edges
            );
          }
        } catch {
          // Ignore
        }
      }
    },

    setSearchQuery: (searchQuery) => {
      set({ searchQuery });
      if (searchQuery.trim()) {
        const match = resolvePlaceByQuery(searchQuery, get().places);
        if (match) {
          set({ selectedPlace: match, toPlaceId: match.id });
          recalculateRoute(get().fromPlaceId, match.id, get().stepFreeOnly);
        }
      }
    },

    selectPlaceByCodeOrQuery: (codeOrQuery) => {
      const match = resolvePlaceByQuery(codeOrQuery, get().places);
      if (match) {
        set({
          selectedPlace: match,
          toPlaceId: match.id,
          searchQuery: match.code,
          sheetSnap: 'half',
        });
        recalculateRoute(get().fromPlaceId, match.id, get().stepFreeOnly);
      }
      return match;
    },

    setSelectedPlace: (place) => {
      set({ selectedPlace: place });
      if (place) {
        set({ toPlaceId: place.id });
        recalculateRoute(get().fromPlaceId, place.id, get().stepFreeOnly);
      }
    },

    setRouteEndpoints: (fromPlaceId, toPlaceId) => {
      set({ fromPlaceId, toPlaceId });
      recalculateRoute(fromPlaceId, toPlaceId, get().stepFreeOnly);
    },

    setStepFreeOnly: (stepFreeOnly) => {
      set({ stepFreeOnly });
      recalculateRoute(get().fromPlaceId, get().toPlaceId, stepFreeOnly);
    },

    setVoiceGuidanceEnabled: (voiceGuidanceEnabled) => set({ voiceGuidanceEnabled }),

    setSheetSnap: (sheetSnap) => set({ sheetSnap }),

    grantLocationConsentAndStartWatch: () => {
      set({ hasLocationConsent: true });
      if (!('geolocation' in navigator)) {
        // Fallback when geolocation hardware is absent: show accuracy fallback banner
        set({
          userCoords: { lat: 31.7758, lng: 76.9855, accuracyMeters: 48 },
        });
        return;
      }

      if (geoWatchId !== null) {
        navigator.geolocation.clearWatch(geoWatchId);
      }

      geoWatchId = navigator.geolocation.watchPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const accuracyMeters = Math.round(pos.coords.accuracy || 45);
          const posInfo = describePositionInCampusLanguage(lat, lng, get().places);

          set({
            userCoords: { lat, lng, accuracyMeters },
            campusPositionText: posInfo.description,
          });

          // Auto re-route on deviation if user moved near a different landmark
          if (
            posInfo.nearestPlace &&
            accuracyMeters <= 30 &&
            posInfo.nearestPlace.id !== get().fromPlaceId
          ) {
            set({ fromPlaceId: posInfo.nearestPlace.id });
            recalculateRoute(
              posInfo.nearestPlace.id,
              get().toPlaceId,
              get().stepFreeOnly
            );
          }
        },
        () => {
          // On permission denial or indoor GPS loss -> trigger >30m accuracy fallback banner
          const posInfo = describePositionInCampusLanguage(31.7758, 76.9855, get().places);
          set({
            userCoords: { lat: 31.7758, lng: 76.9855, accuracyMeters: 55 },
            campusPositionText: posInfo.description,
          });
        },
        { enableHighAccuracy: true, maximumAge: 10_000, timeout: 6_000 }
      );
    },

    stopLocationWatch: () => {
      if (geoWatchId !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(geoWatchId);
        geoWatchId = null;
      }
      set({ hasLocationConsent: false, userCoords: null, liveShareSession: null });
    },

    setManualLandmarkPosition: (placeId) => {
      const place = get().places.find((p) => p.id === placeId);
      if (!place) return;
      const posInfo = describePositionInCampusLanguage(place.lat, place.lng, get().places);
      set({
        fromPlaceId: place.id,
        userCoords: { lat: place.lat, lng: place.lng, accuracyMeters: 10 },
        campusPositionText: posInfo.description,
      });
      recalculateRoute(place.id, get().toPlaceId, get().stepFreeOnly);
    },

    startLiveLocationShare: (conversationId, durationMinutes = 15) => {
      set({
        liveShareSession: {
          conversationId,
          expiresAtMs: Date.now() + durationMinutes * 60_000,
        },
      });
    },

    revokeLiveLocationShare: () => {
      set({ liveShareSession: null });
    },

    upsertAdminPlace: async (input) => {
      await apiFetch('/api/map/places', {
        method: 'PUT',
        body: JSON.stringify(input),
      });
      await get().loadMapBundle();
    },
  };
});
