import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, Modal, TouchableWithoutFeedback, Dimensions } from 'react-native';
import { SortAsc, Calendar, ArrowUpDown, Check, Clock, ListFilter } from 'lucide-react-native';
import { SortBy, SortOrder } from '../hooks/useMedia';
import { cn } from '../utils/cn';

interface SortMenuProps {
  currentSort: { by: SortBy, order: SortOrder };
  onSortChange: (sort: { by: SortBy, order: SortOrder }) => void;
  options: { label: string, value: SortBy, icon: any }[];
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export const SortMenu = ({ currentSort, onSortChange, options }: SortMenuProps) => {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, right: 0 });
  const triggerRef = useRef<View>(null);

  const openMenu = () => {
    triggerRef.current?.measure((x, y, width, height, pageX, pageY) => {
      setPosition({
        top: pageY + height + 8,
        right: Dimensions.get('window').width - (pageX + width),
      });
      setVisible(true);
    });
  };

  const CurrentIcon = options.find(o => o.value === currentSort.by)?.icon || SortAsc;

  return (
    <View>
      <TouchableOpacity 
        ref={triggerRef}
        onPress={openMenu}
        className="flex-row items-center bg-zinc-900 p-2 rounded-full border border-zinc-800 gap-1.5"
      >
        <CurrentIcon size={18} color="#3b82f6" />
        <ArrowUpDown size={12} color="#71717a" />
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="none"
        onRequestClose={() => setVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setVisible(false)}>
          <View className="flex-1 bg-transparent">
            <View 
              style={{ 
                position: 'absolute', 
                top: position.top, 
                right: position.right,
                minWidth: 180 
              }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl"
            >
              <View className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
                <Text className="text-zinc-500 font-bold text-[10px] uppercase tracking-widest">Sort By</Text>
              </View>
              
              {options.map((option) => {
                const isSelected = currentSort.by === option.value;
                const Icon = option.icon;
                
                return (
                  <TouchableOpacity
                    key={option.value}
                    className={cn(
                      "flex-row items-center justify-between px-4 py-3.5",
                      isSelected ? "bg-blue-600/10" : "active:bg-zinc-800"
                    )}
                    onPress={() => {
                      onSortChange({ by: option.value, order: isSelected ? (currentSort.order === 'asc' ? 'desc' : 'asc') : 'asc' });
                      setVisible(false);
                    }}
                  >
                    <View className="flex-row items-center gap-3">
                      <Icon size={18} color={isSelected ? "#3b82f6" : "#71717a"} />
                      <Text className={cn(
                        "text-sm font-medium",
                        isSelected ? "text-blue-500" : "text-zinc-300"
                      )}>
                        {option.label}
                      </Text>
                    </View>
                    {isSelected && (
                      <View className="flex-row items-center gap-1.5">
                         <Text className="text-blue-500/50 text-[9px] uppercase font-bold">
                           {currentSort.order}
                         </Text>
                         <Check size={14} color="#3b82f6" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
};
