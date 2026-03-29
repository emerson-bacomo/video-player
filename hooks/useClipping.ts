import { useState, useCallback, useMemo } from 'react';

export interface Marker {
  time: number;
  markerId: string;
}

export interface MarkerPair {
  startT: number;
  endT: number;
}

export const useClipping = (duration: number) => {
  const [markersData, setMarkersData] = useState<Marker[]>([]);
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);
  const [previewActive, setPreviewActive] = useState(false);

  // Derived pairs: [start, end, start, end, ...]
  const markerPairs = useMemo(() => {
    const pairs: MarkerPair[] = [];
    for (let i = 0; i < markersData.length; i += 2) {
      if (i + 1 < markersData.length) {
        pairs.push({
          startT: markersData[i].time,
          endT: markersData[i + 1].time,
        });
      }
    }
    return pairs;
  }, [markersData]);

  const generateId = useCallback(() => {
    return Math.random().toString(36).substring(2, 15);
  }, []);

  const addMarkerPair = useCallback((startTime: number, endTime: number) => {
    const newMarkers = [
      ...markersData,
      { time: startTime, markerId: generateId() },
      { time: endTime, markerId: generateId() },
    ].sort((a, b) => a.time - b.time);

    setMarkersData(newMarkers);
    return newMarkers[newMarkers.length - 1].markerId;
  }, [markersData, generateId]);

  const removeMarker = useCallback((markerId: string) => {
    // Find the pair containing this marker
    let pairIndices: number[] = [];
    for (let i = 0; i < markersData.length; i += 2) {
      const id1 = markersData[i].markerId;
      const id2 = markersData[i + 1]?.markerId;
      if (id1 === markerId || id2 === markerId) {
        pairIndices = [i, i + 1];
        break;
      }
    }

    if (pairIndices.length > 0) {
      const newMarkers = markersData.filter((_, index) => !pairIndices.includes(index));
      setMarkersData(newMarkers);
      if (activeMarkerId === markerId) setActiveMarkerId(null);
    }
  }, [markersData, activeMarkerId]);

  const updateMarkerTime = useCallback((markerId: string, newTime: number) => {
    setMarkersData(prev => 
      prev.map(m => m.markerId === markerId ? { ...m, time: newTime } : m)
          .sort((a, b) => a.time - b.time)
    );
  }, []);

  const getNextClipStart = useCallback((currentPositionMs: number) => {
    if (markersData.length === 0) return -1;

    for (let i = 0; i < markersData.length; i += 2) {
      const start = markersData[i].time;
      const end = markersData[i + 1]?.time;
      if (end && currentPositionMs < end) {
        if (currentPositionMs < start) return start;
        return -1; // Already in a segment
      }
    }

    // Loop back to start if finished all clips
    return markersData[0].time;
  }, [markersData]);

  const isInSegment = useCallback((currentPositionMs: number) => {
    for (let i = 0; i < markersData.length; i += 2) {
      const start = markersData[i].time;
      const end = markersData[i + 1]?.time;
      if (end && currentPositionMs >= start && currentPositionMs < end) {
        return true;
      }
    }
    return false;
  }, [markersData]);

  return {
    markersData,
    markerPairs,
    activeMarkerId,
    setActiveMarkerId,
    previewActive,
    setPreviewActive,
    addMarkerPair,
    removeMarker,
    updateMarkerTime,
    getNextClipStart,
    isInSegment,
  };
};
