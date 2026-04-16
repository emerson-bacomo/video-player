import { useState, useCallback, useMemo } from 'react';

export interface Marker {
  time: number;
  markerId: string;
}

export interface MarkerPair {
  id: string;
  start: Marker;
  end?: Marker;
  isFixed: boolean;
}

export const useClipping = (duration: number) => {
  const [fixedSegments, setFixedSegments] = useState<MarkerPair[]>([]);
  const [draftMarkers, setDraftMarkers] = useState<Marker[]>([]);
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);
  const [previewActive, setPreviewActive] = useState(false);

  const generateId = useCallback(() => {
    return Math.random().toString(36).substring(2, 15);
  }, []);

  const draftPairs = useMemo(() => {
    const sorted = [...draftMarkers].sort((a, b) => a.time - b.time);
    const pairs: MarkerPair[] = [];
    for (let i = 0; i < sorted.length; i += 2) {
      pairs.push({
        id: `draft-${i}`,
        start: sorted[i],
        end: sorted[i + 1],
        isFixed: false,
      });
    }
    return pairs;
  }, [draftMarkers]);

  const addMarker = useCallback((time: number) => {
    const newId = generateId();
    setDraftMarkers(prev => [...prev, { time, markerId: newId }]);
    setActiveMarkerId(newId);
  }, [generateId]);

  const removeMarker = useCallback((markerId: string) => {
    setDraftMarkers(prev => prev.filter(m => m.markerId !== markerId));
    if (activeMarkerId === markerId) setActiveMarkerId(null);
  }, [activeMarkerId]);

  const saveSession = useCallback(() => {
    const sorted = [...draftMarkers].sort((a, b) => a.time - b.time);
    const newFixed: MarkerPair[] = [];
    
    for (let i = 0; i < sorted.length - 1; i += 2) {
      newFixed.push({
        id: generateId(),
        start: sorted[i],
        end: sorted[i + 1],
        isFixed: true,
      });
    }

    if (newFixed.length === 0) return { success: false, message: "No complete segments to save." };

    setFixedSegments(prev => [...prev, ...newFixed]);
    setDraftMarkers([]);
    setActiveMarkerId(null);
    return { success: true };
  }, [draftMarkers, generateId]);

  const removeFixedSegment = useCallback((id: string) => {
    setFixedSegments(prev => prev.filter(p => p.id !== id));
  }, []);

  const updateMarkerTime = useCallback((markerId: string, newTime: number) => {
    setDraftMarkers(prev => prev.map(m => 
      m.markerId === markerId ? { ...m, time: newTime } : m
    ));
  }, []);

  const getNextClipStart = useCallback((currentPositionMs: number) => {
    const allPairs = [...fixedSegments, ...draftPairs].filter(p => p.end).sort((a, b) => a.start.time - b.start.time);
    if (allPairs.length === 0) return -1;

    for (const pair of allPairs) {
      if (currentPositionMs < (pair.end?.time || 0)) {
        if (currentPositionMs < pair.start.time) return pair.start.time;
        return -1; // In segment
      }
    }
    return allPairs[0].start.time;
  }, [fixedSegments, draftPairs]);

  const isInSegment = useCallback((currentPositionMs: number) => {
    const allPairs = [...fixedSegments, ...draftPairs];
    return allPairs.some(p => 
      p.end && currentPositionMs >= p.start.time && currentPositionMs < p.end.time
    );
  }, [fixedSegments, draftPairs]);

  return {
    markerPairs: [...fixedSegments, ...draftPairs],
    draftMarkers,
    activeMarkerId,
    setActiveMarkerId,
    previewActive,
    setPreviewActive,
    addMarker,
    removeMarker,
    saveSession,
    removeFixedSegment,
    updateMarkerTime,
    getNextClipStart,
    isInSegment,
  };
};
