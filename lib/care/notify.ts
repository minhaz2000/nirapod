/** Browser notifications with an in-app fallback (the caller shows a banner when this returns false). */
export type NotificationState = 'granted' | 'denied' | 'default' | 'unsupported';

export function notificationState(): NotificationState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission as NotificationState;
}

export async function requestNotifications(): Promise<NotificationState> {
  if (notificationState() === 'unsupported') return 'unsupported';
  return (await Notification.requestPermission()) as NotificationState;
}

/** Shows a system notification if allowed. Returns false when the app must show its own banner instead. */
export async function notify(title: string, body: string, tag: string): Promise<boolean> {
  if (notificationState() !== 'granted') return false;
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg) await reg.showNotification(title, { body, tag, icon: '/icons/icon-192.png' });
    else new Notification(title, { body, tag, icon: '/icons/icon-192.png' });
    return true;
  } catch {
    return false;
  }
}
