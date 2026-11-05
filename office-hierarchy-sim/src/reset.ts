/** Reset uses fresh entropy; seeded replay/experiments continue to use the seeded RNG. */
export function freshSeed(previous:number):number {
  const value=crypto.getRandomValues(new Uint32Array(1))[0];
  return value===previous?(previous+1)>>>0:value;
}
