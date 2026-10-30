export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Quality = "pixel" | "sharp";
export type RendererMode = "2d" | "3d" | "vgpu";
export interface RendererInfo {
  kind: string;
  name: string;
  software: boolean;
  virtual?: boolean;
  exposed?: boolean;
}
export interface GameState {
  x: number;
  z: number;
  angle: number;
  speed: number;
  steer: number;
  dist: number;
  health: number;
  keys: Record<string, boolean>;
  playing: boolean;
  paused: boolean;
  job: number;
  loaded: boolean;
  done: boolean;
  credits: number;
  deliveries: number;
  hit: number;
  time: number;
  boost: number;
}
export type GameSnapshot = Omit<GameState, "keys">;
export type GameView = Pick<
  GameState,
  "x" | "z" | "angle" | "speed" | "job" | "loaded" | "done" | "keys"
>;
export type UpdateGame = (snapshot: GameSnapshot) => void;
export interface RenderLoopProps {
  game: GameState;
  advanceGame: (dt: number) => void;
  onUpdate: UpdateGame;
  quality: Quality;
}
export interface Tree {
  x: number;
  z: number;
  s: number;
}
export type Rock = Tree;
export interface BuildingData {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  c: string;
  roof: string;
  kind: string;
}
export interface Stop {
  name: string;
  x: number;
  z: number;
  label: string;
  color: string;
}
export interface Job {
  to: number;
  title: string;
  cargo: string;
  desc: string;
  pay: number;
}
export function snapshotGame(game: GameState): GameSnapshot {
  const { keys: _keys, ...snapshot } = game;
  return snapshot;
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
