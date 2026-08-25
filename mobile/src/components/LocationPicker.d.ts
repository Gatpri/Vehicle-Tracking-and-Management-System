/**
 * Type surface for the platform-split LocationPicker.
 *
 * The bundler resolves "./LocationPicker" to the .native or .web file;
 * TypeScript does not follow that, so the shared signature is declared here.
 */
import type { LocationPickerProps } from "./LocationPicker.types";

export type { LatLng, LocationPickerProps } from "./LocationPicker.types";

export declare function LocationPicker(props: LocationPickerProps): JSX.Element;
