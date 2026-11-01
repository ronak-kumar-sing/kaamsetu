import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';

import { Text } from '@/components/ui';

export interface BottomSheetProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Simple modal sheet anchored to the bottom. Tapping the scrim or the system back closes it. */
export function BottomSheet({ visible, title, onClose, children }: BottomSheetProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-end"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          className="absolute inset-0 bg-black/40"
        />
        <View className="max-h-[85%] rounded-t-3xl bg-background px-4 pb-8 pt-4">
          <View className="mb-3 h-1 w-10 self-center rounded-full bg-border" />
          <Text variant="heading" className="mb-3">
            {title}
          </Text>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4 pb-2">
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
