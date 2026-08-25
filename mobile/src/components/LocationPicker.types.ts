export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Shared between LocationPicker.native.tsx and LocationPicker.web.tsx.
 *
 * These live in their own file because a `.native`/`.web` pair is resolved by
 * the bundler per platform — neither file can import types from the other
 * without dragging in its implementation too.
 */
export interface LocationPickerProps {
  value: LatLng | null;
  onChange: (next: LatLng) => void;
  /** Called with a human-readable address when one can be resolved. */
  onAddressResolved?: (address: string) => void;
  height?: number;
}
