declare module "geokdbush" {
  import KDBush from "kdbush";
  export function around(index: KDBush, lng: number, lat: number, maxResults?: number,
    maxDistance?: number, predicate?: (i: number) => boolean): number[];
  export function distance(lng: number, lat: number, lng2: number, lat2: number): number;
}
