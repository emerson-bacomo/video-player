import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Marker, MarkerPair } from '../hooks/useClipping';

interface ClippingOverlayProps {
  markerPairs: MarkerPair[];
  markersData: Marker[];
  duration: number;
  width: number;
}

export const ClippingOverlay: React.FC<ClippingOverlayProps> = ({
  markerPairs,
  markersData,
  duration,
  width,
}) => {
  if (duration <= 0) return null;

  return (
    <View 
      className="absolute inset-0 h-10 z-10" 
      style={{ width }} 
      pointerEvents="none"
    >
      {/* Clip Segments */}
      {markerPairs.map((pair, index) => {
        const left = (pair.startT / duration) * width;
        const clipWidth = ((pair.endT - pair.startT) / duration) * width;
        
        return (
          <View
            key={`pair-${index}`}
            className="absolute bg-emerald-500/60 h-1 rounded-sm top-[18px]"
            style={{
              left,
              width: clipWidth,
            }}
          />
        );
      })}

      {/* Clip Markers */}
      {markersData.map((marker, index) => {
        const left = (marker.time / duration) * width;
        
        return (
          <View
            key={`marker-${marker.markerId}`}
            className="absolute bg-amber-500 w-1 h-[18px] top-[11px] rounded-sm border border-white"
            style={{
              left: left - 2, // Center the 4px marker
            }}
          />
        );
      })}
    </View>
  );
};
