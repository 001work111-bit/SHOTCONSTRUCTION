import type { ProjectState } from '../types';

/** Deep clone project state for history snapshots */
export function cloneProject(state: ProjectState): ProjectState {
  return structuredClone(state);
}
