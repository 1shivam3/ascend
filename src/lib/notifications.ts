import { NotificationPreferences } from './types';

export function isWithinQuietHours(
  now: Date,
  quietHours: { enabled: boolean; start: string; end: string }
): boolean {
  if (!quietHours.enabled) return false;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [startH, startM] = quietHours.start.split(':').map(Number);
  const [endH, endM] = quietHours.end.split(':').map(Number);

  const startMinutes = startH * 60 + (startM || 0);
  const endMinutes = endH * 60 + (endM || 0);

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    // Overnight quiet hours (e.g. 22:00 to 07:00)
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
}

export function formatNotificationPayload(
  type: 'water' | 'meal' | 'workout' | 'weekly_report',
  mealType?: 'breakfast' | 'lunch' | 'dinner'
) {
  switch (type) {
    case 'water':
      return {
        title: 'Hydration Check-in',
        body: 'Time to drink a glass of water and hit your hydration target.',
        tab: 'home',
        tag: 'ascend-water',
      };
    case 'meal':
      return {
        title: 'Meal Nutrition Reminder',
        body: mealType
          ? `Time for ${mealType}. Log your meal to stay on track.`
          : 'Fuel your recovery. Log your meal to stay on track.',
        tab: 'meals',
        tag: 'ascend-meal',
      };
    case 'workout':
      return {
        title: "Today's Training Session",
        body: 'Your scheduled workout is ready. Tap to view your exercise split.',
        tab: 'workout',
        tag: 'ascend-workout',
      };
    case 'weekly_report':
      return {
        title: 'Weekly Performance Recap Ready',
        body: 'Review your training consistency and lift progress from this past week.',
        tab: 'progress',
        tag: 'ascend-report',
      };
  }
}
