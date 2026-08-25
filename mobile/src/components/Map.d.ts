/**
 * Type surface for the platform-split Map.
 *
 * At build time the bundler resolves `./Map` to Map.native.tsx or Map.web.tsx.
 * TypeScript does not follow that resolution, so without this declaration an
 * import of "./Map" would not type-check on either platform. Both
 * implementations conform to the signature declared here.
 */
import type { MapProps } from "./Map.types";

export type { MapPoint, MapProps } from "./Map.types";

export declare function Map(props: MapProps): JSX.Element;
