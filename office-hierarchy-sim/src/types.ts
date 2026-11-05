export type Role = 'CEO' | 'LEAD' | 'ASSOCIATE' | 'JUNIOR';
export type State = 'WANDER' | 'PHONE' | 'APPROACH' | 'PRETEND_WORK' | 'FLEE_TO_WC' | 'FLEE_IN_OFFICE' | 'WC_HIDE' | 'FLEE_TO_ROOM' | 'ROOM_HIDE' | 'COOLDOWN';
export type Room = 'WORK' | 'MEETING' | 'LOUNGE' | 'WC' | 'CORRIDOR';
export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number; kind: 'wall' | 'desk' | 'furniture'; id: string };
export interface Agent extends Point {
  id: string; role: Role; rank: number; heading: number; radius: number; fovDeg: number; visionRangeM: number;
  velocity: Point; lastThreatPlan: number; speedLevel: number; state: State; targetAgentId: string | null; targetPoint: Point | null; path: Point[];
  lastSeenSuperiorAt: number | null; stateStartedAt: number; wcReservation: boolean; targetRoom: Room | null;
  episode: string | null; reactionMode:'work'|'escape'|null; seen: Map<string, number>; stable: Set<string>; superiorIds: string[]; inferiorIds: string[];
  until: number; arrivedAt: number | null; lastPlan: number; lastTargetSeen: number; stuck: number;
  trail: Array<Point & { t: number }>; distance: number; movingTime: number; stateTime: Record<State, number>;
  pursuitCooldowns: Map<string,number>; events: Record<State, number>; superiorTime: number; ceoDistance: number; roomTime: Record<Room, number>;
}
export interface Config {
  counts: Record<Role,number>; seed: number; fov: number; radii: Record<Role, number>; pretendProbability: number; wcCapacity: number;
  avoidanceDuration: number; pursuitDuration: number; speedMultiplier: number; desksBlockSight: boolean;
  wcEscapeProbability: number; openVisibility: boolean; closeReevaluate: boolean;
}
export interface Perception { superiors: Agent[]; inferiors: Agent[] }
export interface SimEvent { t: number; agent: string; from: State; to: State; reason: string }
