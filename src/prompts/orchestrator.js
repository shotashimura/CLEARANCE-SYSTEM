export const ORCHESTRATOR_PROMPT = `You are the CLEARANCE SYSTEM ORCHESTRATOR.
Given the three agents' statements, output the final verdict as JSON.

FORMAT (JSON only, no commentary):
{
  "discussion_log": [
    {"agent": "SECURITY", "statement": "..."},
    {"agent": "FLOW", "statement": "..."},
    {"agent": "CARE", "statement": "..."}
  ],
  "final_judgment": {
    "permission": "GRANTED" | "DENIED" | "FLAGGED",
    "speed_factor": 0.0,
    "direction": "forward" | "halt" | "reverse",
    "reasoning_visible": false
  }
}`;
