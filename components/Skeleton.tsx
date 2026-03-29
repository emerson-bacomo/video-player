import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, interpolate } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { cn } from '../lib/utils';

const { width } = Dimensions.get('window');

export const Skeleton = ({ className, style }: { className?: string, style?: any }) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1500, easing: Easing.linear }),
      -1,
      false
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateX: interpolate(progress.value, [0, 1], [-width, width])
        }
      ]
    };
  });

  return (
    <View className={cn("bg-zinc-900 overflow-hidden", className)} style={style}>
      <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.05)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1, width: '100%', transform: [{ skewX: '-20deg' }] }}
        />
      </Animated.View>
    </View>
  );
};
