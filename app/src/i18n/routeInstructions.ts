import type { Language } from "./strings";

// Route steps come back from OneMap (and the transit legs built from it on
// the server) in English only. They follow a small, fixed pattern - an
// action, then optionally a connector and a place name ("Turn Left Onto
// Punggol Road") - so the action is translated and the place name kept as
// it is: OneMap only has English street and station names, which is also
// what Singapore's road signs show. A sentence that doesn't fit the pattern
// stays in English rather than risk showing a wrong instruction.

const COMPASS: Record<string, string> = {
  north: "北",
  northeast: "东北",
  east: "东",
  southeast: "东南",
  south: "南",
  southwest: "西南",
  west: "西",
  northwest: "西北",
};

const ACTIONS: Record<string, string> = {
  "turn left": "左转",
  "turn right": "右转",
  "turn slight left": "稍向左转",
  "turn slight right": "稍向右转",
  "make a slight left": "稍向左转",
  "make a slight right": "稍向右转",
  "make a sharp left": "向左急转",
  "make a sharp right": "向右急转",
  "make a u-turn": "掉头",
  "make a u-turn and continue": "掉头后继续",
  "keep left": "靠左",
  "keep right": "靠右",
  "merge left": "向左并入",
  "merge right": "向右并入",
  continue: "继续前行",
  "continue straight": "继续直行",
  "go straight": "直行",
  "continue left": "继续向左",
  "continue right": "继续向右",
  "continue slightly left": "继续稍向左",
  "continue slightly right": "继续稍向右",
  "continue slight left": "继续稍向左",
  "continue slight right": "继续稍向右",
  "take the ramp": "驶入匝道",
  "you have arrived": "已到达",
};

// Words the server fills in itself when OneMap leaves a name out.
const PLACEHOLDERS: Record<string, string> = {
  destination: "目的地",
  "your destination": "目的地",
  "your stop": "你的站点",
  bus: "巴士",
  train: "列车",
};

function place(name: string): string {
  return PLACEHOLDERS[name.toLowerCase()] ?? name;
}

function toChinese(instruction: string): string | null {
  // Transit legs, worded on the server: "Walk to X" and "NS1 · A → B".
  const walk = instruction.match(/^Walk(?: to (.+))?$/i);
  if (walk) {
    if (!walk[1]) return "步行";
    const to = place(walk[1]);
    // A space only before an English name.
    return to === walk[1] ? `步行至 ${to}` : `步行至${to}`;
  }
  const ride = instruction.match(/^(.+?) · (.+) → (.+)$/);
  if (ride) return `${place(ride[1])} · ${place(ride[2])} → ${place(ride[3])}`;

  const parts = instruction.match(/^(.+?)(?: (To Stay On|Onto|On|At) (.+))?$/i);
  if (!parts) return null;
  const [, actionText, connector, street] = parts;

  const head = actionText.match(/^Head (\w+)$/i);
  const compass = head ? COMPASS[head[1].toLowerCase()] : undefined;
  if (head && !compass) return null;
  const action = compass ? `向${compass}出发` : ACTIONS[actionText.toLowerCase()];
  if (!action) return null;

  if (!connector) return action;
  const name = place(street);
  switch (connector.toLowerCase()) {
    case "on":
      return compass ? `沿 ${name} 向${compass}出发` : `${action}，沿 ${name} 行进`;
    case "onto":
      return actionText.toLowerCase().startsWith("merge") ? `${action} ${name}` : `${action}，进入 ${name}`;
    case "to stay on":
      return action.startsWith("继续") ? `${action}，沿 ${name} 行进` : `${action}，继续沿 ${name} 行进`;
    case "at":
      return action === "已到达" ? `已到达 ${name}` : `在 ${name} ${action}`;
    default:
      return null;
  }
}

export function translateInstruction(instruction: string, language: Language): string {
  if (language === "en") return instruction;
  return toChinese(instruction.trim()) ?? instruction;
}
