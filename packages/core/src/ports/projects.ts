/** A repo drums may attach to a workspace. */
export interface Project {
  name: string;
  path: string;
}

/** The repos the user told drums about (spec §8). */
export interface Projects {
  list(): Project[];
}
