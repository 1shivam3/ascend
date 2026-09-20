import { useEffect } from 'react';
import { BackHandler, Platform } from 'react-native';

/**
 * Custom hook to intercept Android hardware back button presses.
 * @param onBackPress Callback returning true to prevent default back action, or false to allow it.
 * @param enabled Whether the listener is currently active.
 */
export function useAndroidBackHandler(onBackPress: () => boolean, enabled: boolean = true): void {
  useEffect(() => {
    if (Platform.OS !== 'android' || !enabled) {
      return;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [onBackPress, enabled]);
}
