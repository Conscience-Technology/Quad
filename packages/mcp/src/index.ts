/**
 * @quad/mcp — programmatic exports. Real tool definitions land in Phase 1i.
 */
export const VERSION = "0.0.0";

export const TOOLS = [
  "quad_list_tasks",
  "quad_pick_task",
  "quad_get_task",
  "quad_get_frames",
  "quad_get_transcript",
  "quad_get_timeline",
  "quad_get_source",
  "quad_update_task",
  "quad_post_comment",
  "quad_search_tasks",
] as const;

export type QuadTool = (typeof TOOLS)[number];
