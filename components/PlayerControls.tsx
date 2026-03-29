import React, { useState } from 'react';
import { View, Text, TouchableOpacity, LayoutChangeEvent } from 'react-native';
import { Play, Pause, SkipForward, SkipBack, Volume2, Sun, Scissors, Save, Trash2, Eye } from 'lucide-react-native';
import Slider from '@react-native-community/slider';
import { LinearGradient } from 'expo-linear-gradient';
import { ClippingOverlay } from './ClippingOverlay';
import { Marker, MarkerPair } from '../hooks/useClipping';

interface PlayerControlsProps {
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSeek: (value: number) => void;
  onSkipNext: () => void;
  onSkipPrevious: () => void;
  currentTime: number;
  duration: number;
  // Clipping Props
  isClipMode: boolean;
  onToggleClipMode: () => void;
  markerPairs: MarkerPair[];
  markersData: Marker[];
  previewActive: boolean;
  onTogglePreview: () => void;
  onAddClip: () => void;
  onRemoveClip: () => void;
  onSaveClips: () => void;
}

export const PlayerControls: React.FC<PlayerControlsProps> = ({
  isPlaying,
  onTogglePlay,
  onSeek,
  onSkipNext,
  onSkipPrevious,
  currentTime,
  duration,
  isClipMode,
  onToggleClipMode,
  markerPairs,
  markersData,
  previewActive,
  onTogglePreview,
  onAddClip,
  onRemoveClip,
  onSaveClips,
}) => {
  const [sliderWidth, setSliderWidth] = useState(0);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const onSliderLayout = (e: LayoutChangeEvent) => {
    setSliderWidth(e.nativeEvent.layout.width);
  };

  return (
    <View className="absolute bottom-0 left-0 right-0 z-50">
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.8)']}
        className="px-4 pb-10 pt-8"
      >
        <View className="flex-row justify-between items-center mb-4">
          {/* Clipping Mode Icons */}
          {isClipMode ? (
            <View className="flex-row space-x-3 bg-black/40 rounded-full px-3 py-1">
              <TouchableOpacity onPress={onTogglePreview} className={previewActive ? 'p-2 bg-amber-500 rounded-full' : 'p-2'}>
                <Eye size={20} color="white" />
              </TouchableOpacity>
              <TouchableOpacity onPress={onAddClip} className="p-2">
                <Scissors size={20} color="white" />
              </TouchableOpacity>
              <TouchableOpacity onPress={onRemoveClip} className="p-2">
                <Trash2 size={20} color="white" />
              </TouchableOpacity>
              <TouchableOpacity onPress={onSaveClips} className="p-2">
                <Save size={20} color="white" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={onToggleClipMode} className="p-2 bg-black/20 rounded-full">
              <Scissors size={20} color="white" />
            </TouchableOpacity>
          )}

          {/* Volume/Brightness placeholders */}
          <View className="flex-row space-x-4">
            <TouchableOpacity className="p-2 bg-black/20 rounded-full">
              <Volume2 size={20} color="white" />
            </TouchableOpacity>
            <TouchableOpacity className="p-2 bg-black/20 rounded-full">
              <Sun size={20} color="white" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Progress Slider */}
        <View className="mb-4 relative" onLayout={onSliderLayout}>
          {isClipMode && (
            <ClippingOverlay 
              markerPairs={markerPairs} 
              markersData={markersData} 
              duration={duration} 
              width={sliderWidth} 
            />
          )}
          <Slider
            style={{ width: '100%', height: 40, zIndex: 20 }}
            minimumValue={0}
            maximumValue={duration}
            value={currentTime}
            onSlidingComplete={onSeek}
            minimumTrackTintColor={isClipMode ? 'transparent' : '#f59e0b'} // Hide orange track in clip mode to see segments
            maximumTrackTintColor="#374151"
            thumbTintColor="#f59e0b"
          />
          <View className="flex-row justify-between px-1">
            <Text className="text-white text-xs">{formatTime(currentTime)}</Text>
            <Text className="text-white text-xs">{formatTime(duration)}</Text>
          </View>
        </View>

        {/* Playback Controls */}
        <View className="flex-row items-center justify-center space-x-12">
          <TouchableOpacity onPress={onSkipPrevious}>
            <SkipBack size={32} color="white" fill="white" />
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={onTogglePlay}
            className="bg-white/10 p-4 rounded-full"
          >
            {isPlaying ? (
              <Pause size={48} color="white" fill="white" />
            ) : (
              <Play size={48} color="white" fill="white" />
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={onSkipNext}>
            <SkipForward size={32} color="white" fill="white" />
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </View>
  );
};
