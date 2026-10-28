import * as Location from 'expo-location';
import type { Coords } from './qibla';

/**
 * The phone's last known position, for the Qibla widget, if the app may already
 * use location (granted for Fajr times or the Qibla sheet). Never asks: no
 * permission, no position. Only the bearing and distance worked out from it
 * reach the widget (lib/widgets/qibla).
 */
export async function lastKnownPosition(): Promise<Coords | null> {
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted) return null;
    const position = await Location.getLastKnownPositionAsync();
    return position ? { latitude: position.coords.latitude, longitude: position.coords.longitude } : null;
  } catch {
    return null;
  }
}
