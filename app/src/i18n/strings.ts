import type { HoursStatusDetail } from "../services/hours";

export type Language = "en" | "zh";

export const STRINGS = {
  en: {
    "tab.areas": "Areas",
    "tab.saved": "Saved",
    "tab.search": "Search",
    "tab.settings": "Settings",
    "screen.venue": "Venue",
    "screen.settings": "Settings",
    "settings.language": "LANGUAGE",
    "settings.english": "English",
    "settings.chinese": "中文",
    "settings.appearance": "APPEARANCE",
    "settings.darkMode": "Dark Mode",
    "settings.account": "ACCOUNT",
    "settings.username": "Username",
    "settings.password": "Password (8+ characters)",
    "settings.logIn": "Log In",
    "settings.signUp": "Sign Up",
    "settings.logOut": "Log Out",
    "settings.hint": "Saved venues work without an account too — signing in just syncs them across devices.",
    "crowd.Low": "Low",
    "crowd.Moderate": "Moderate",
    "crowd.High": "High",
    "crowd.VeryHigh": "Very High",
    "crowd.Closed": "Closed",
    "crowd.Unavailable": "Unavailable",
    "category.Transit": "Transit",
    "category.Venue": "Venue",
    "search.placeholder": "Search here",
    "search.typeToSearch": "Start typing to search.",
    "search.noMatch": "No venues match \"{query}\".",
    "saved.empty": "No saved areas.",
    "layers.none": "Toggle on venue types to view crowds.",
    "map.empty": "No venues in view — pan or zoom out the map.",
    "map.web": "Map view is available in the iOS/Android app.",
    "map.locationNeededTitle": "Location access needed",
    "map.locationNeededBody": "Enable location access for Crowdy in Settings to recentre the map.",
    "map.locationUnavailableTitle": "Location unavailable",
    "map.locationUnavailableBody": "Couldn't get your current location. Try again in a moment.",
    "map.toggleHeatmap": "Toggle crowd heatmap",
    "map.recentre": "Recentre map on my location",
    "map.toggleLayer": "Toggle {label} layer",
    "row.kmAway": "{distance}km away from you",
    "row.noDistance": "Distance unavailable — enable location",
    "row.percentOfPeak": "{percent}% of peak",
    "row.operating": "Operating",
    "row.seeDetails": "See more details ›",
    "row.updated": "updated {time}",
    "detail.notFound": "Venue not found.",
    "detail.percentOfPeak": "{percent}% of peak",
    "detail.updated": "Updated {time} · source: {source}",
    "detail.refreshing": "Refreshing…",
    "detail.typical": "Typical Crowd Levels",
    "detail.noCrowd": "No crowd data available yet for this venue.",
    "detail.parking": "Parking availability",
    "detail.lots": "{label}: {count} lots available",
    "detail.alternatives": "Alternatives nearby",
    "detail.kmAway": "{distance} km away",
    "screen.directions": "Directions",
    "detail.save": "Save venue",
    "detail.unsave": "Remove from saved",
    "detail.directions": "Directions",
    "directions.to": "To",
    "directions.transit": "Transit",
    "directions.walk": "Walk",
    "directions.drive": "Drive",
    "directions.cycle": "Cycle",
    "directions.finding": "Finding the best route…",
    "directions.retry": "Try again",
    "directions.loadFailed": "Couldn't load this route right now.",
    "directions.locationNeeded": "Location access is needed to work out directions from where you are.",
    "directions.transfer": "{count} transfer",
    "directions.transfers": "{count} transfers",
    "directions.walking": "{time} walking",
    "directions.stop": "{count} stop",
    "directions.stops": "{count} stops",
    "directions.crowdAt": "{level} crowd at {station}",
    "directions.thisStop": "this stop",
    "duration.underMin": "<1 min",
    "duration.min": "{m} min",
    "duration.hr": "{h} hr",
    "duration.hrMin": "{h} hr {m} min",
    "distance.m": "{n} m",
    "distance.km": "{n} km",
    "hours.prefix": "Hours:",
    "hours.open": "Open",
    "hours.closed": "Closed",
    "hours.always": "Open 24 hours",
    "hours.closes": "Closes {time}",
    "hours.opens": "Opens {time}",
    "hours.opensTomorrow": "Opens {time} tomorrow",
    "hours.opensOn": "Opens {time} {day}",
    "day.0": "Sunday",
    "day.1": "Monday",
    "day.2": "Tuesday",
    "day.3": "Wednesday",
    "day.4": "Thursday",
    "day.5": "Friday",
    "day.6": "Saturday",
    "chart.now": "(now)",
    "chart.peak": "{percent}% of crowd peak",
    "auth.savedTitle": "Saved venues on this device",
    "auth.savedBody": "This device has {count} venue(s) saved without an account. Add them to your saved list?",
    "auth.dontAdd": "Don't Add",
    "auth.add": "Add to My Saved",
    "auth.mergeFailedTitle": "Couldn't add saved venues",
    "auth.mergeFailedBody": "They're still saved on this device. You'll be asked again the next time you sign in.",
    "auth.generic": "Something went wrong — try again.",
    "auth.invalid": "Invalid username or password",
    "auth.badSignup": "A username (3–24 letters, numbers, or underscore) and a password (8+ characters) are required",
    "auth.taken": "This username is already taken",
    "source.GooglePopularTimes": "Google Popular Times",
    "source.LTA": "LTA",
    "source.Mock": "Sample",
  },
  zh: {
    "tab.areas": "附近",
    "tab.saved": "收藏",
    "tab.search": "搜索",
    "tab.settings": "设置",
    "screen.venue": "地点",
    "screen.settings": "设置",
    "settings.language": "语言",
    "settings.english": "English",
    "settings.chinese": "中文",
    "settings.appearance": "外观",
    "settings.darkMode": "深色模式",
    "settings.account": "账号",
    "settings.username": "用户名",
    "settings.password": "密码（至少 8 位）",
    "settings.logIn": "登录",
    "settings.signUp": "注册",
    "settings.logOut": "退出登录",
    "settings.hint": "不登录也能收藏，只保存在这台设备上。登录后会同步到账号。",
    "crowd.Low": "较少",
    "crowd.Moderate": "适中",
    "crowd.High": "拥挤",
    "crowd.VeryHigh": "非常拥挤",
    "crowd.Closed": "已关闭",
    "crowd.Unavailable": "暂无数据",
    "category.Transit": "轨道交通",
    "category.Venue": "场所",
    "search.placeholder": "在此搜索",
    "search.typeToSearch": "输入内容开始搜索。",
    "search.noMatch": "没有与「{query}」匹配的地点。",
    "saved.empty": "还没有收藏。",
    "layers.none": "打开地点类型以查看人流。",
    "map.empty": "当前视野内没有地点，试着移动或缩小地图。",
    "map.web": "地图仅在 iOS / Android 应用中可用。",
    "map.locationNeededTitle": "需要定位权限",
    "map.locationNeededBody": "请在系统设置中允许 Crowdy 使用定位，以便把地图移回你的位置。",
    "map.locationUnavailableTitle": "暂时无法定位",
    "map.locationUnavailableBody": "没有获取到当前位置，请稍后再试。",
    "map.toggleHeatmap": "切换人流热力图",
    "map.recentre": "将地图移回我的位置",
    "map.toggleLayer": "切换{label}图层",
    "row.kmAway": "距你 {distance} 公里",
    "row.noDistance": "无法计算距离，请开启定位",
    "row.percentOfPeak": "峰值的 {percent}%",
    "row.operating": "运营中",
    "row.seeDetails": "查看详情 ›",
    "row.updated": "更新于 {time}",
    "detail.notFound": "找不到这个地点。",
    "detail.percentOfPeak": "峰值的 {percent}%",
    "detail.updated": "更新于 {time} · 来源：{source}",
    "detail.refreshing": "正在刷新…",
    "detail.typical": "平时人流",
    "detail.noCrowd": "这个地点暂时没有人流数据。",
    "detail.parking": "停车位",
    "detail.lots": "{label}：剩余 {count} 个车位",
    "detail.alternatives": "附近更空的选择",
    "detail.kmAway": "相距 {distance} 公里",
    "screen.directions": "路线",
    "detail.save": "收藏地点",
    "detail.unsave": "取消收藏",
    "detail.directions": "路线",
    "directions.to": "前往",
    "directions.transit": "公共交通",
    "directions.walk": "步行",
    "directions.drive": "驾车",
    "directions.cycle": "骑行",
    "directions.finding": "正在寻找最佳路线…",
    "directions.retry": "重试",
    "directions.loadFailed": "暂时无法加载这条路线。",
    "directions.locationNeeded": "需要开启定位，才能计算从你所在位置出发的路线。",
    "directions.transfer": "换乘 {count} 次",
    "directions.transfers": "换乘 {count} 次",
    "directions.walking": "步行 {time}",
    "directions.stop": "{count} 站",
    "directions.stops": "{count} 站",
    "directions.crowdAt": "{station}：人流{level}",
    "directions.thisStop": "此站",
    "duration.underMin": "不到 1 分钟",
    "duration.min": "{m} 分钟",
    "duration.hr": "{h} 小时",
    "duration.hrMin": "{h} 小时 {m} 分钟",
    "distance.m": "{n} 米",
    "distance.km": "{n} 公里",
    "hours.prefix": "营业时间：",
    "hours.open": "营业中",
    "hours.closed": "已关闭",
    "hours.always": "24 小时营业",
    "hours.closes": "{time} 结束",
    "hours.opens": "{time} 开始",
    "hours.opensTomorrow": "明天 {time} 开始",
    "hours.opensOn": "{day} {time} 开始",
    "day.0": "星期日",
    "day.1": "星期一",
    "day.2": "星期二",
    "day.3": "星期三",
    "day.4": "星期四",
    "day.5": "星期五",
    "day.6": "星期六",
    "chart.now": "（现在）",
    "chart.peak": "人流峰值的 {percent}%",
    "auth.savedTitle": "这台设备上的收藏",
    "auth.savedBody": "未登录时收藏了 {count} 个地点。要加入账号吗？",
    "auth.dontAdd": "不加入",
    "auth.add": "加入我的收藏",
    "auth.mergeFailedTitle": "无法添加收藏的地点",
    "auth.mergeFailedBody": "它们仍保存在这台设备上。下次登录时会再次询问你。",
    "auth.generic": "出了点问题，请再试一次。",
    "auth.invalid": "用户名或密码不正确",
    "auth.badSignup": "用户名需为 3–24 位字母、数字或下划线，密码至少 8 位",
    "auth.taken": "这个用户名已被使用",
    "source.GooglePopularTimes": "谷歌繁忙时段",
    "source.LTA": "陆交局",
    "source.Mock": "示例",
  },
} as const;

export type StringKey = keyof typeof STRINGS.en;

export function fill(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ""));
}

const SERVER_ERRORS: Record<string, StringKey> = {
  "Invalid username or password": "auth.invalid",
  "A username (3-24 letters/numbers/underscore) and a password (8+ characters) are required": "auth.badSignup",
  "This username is already taken": "auth.taken",
  "Something went wrong - try again.": "auth.generic",
  "Something went wrong — try again.": "auth.generic",
};

export function sourceLabel(source: string, language: Language): string {
  const key =
    source === "GooglePopularTimes"
      ? "source.GooglePopularTimes"
      : source === "LTA"
        ? "source.LTA"
        : source === "Mock"
          ? "source.Mock"
          : null;
  return key ? STRINGS[language][key] : source;
}

export function serverErrorKey(message: string): StringKey | null {
  return SERVER_ERRORS[message] ?? null;
}

// Google-style "10:30 pm" strings. Chinese shows 下午10:30 instead.
export function formatHoursDetail(detail: HoursStatusDetail, language: Language): string {
  const text = (key: StringKey, vars?: Record<string, string | number>) => fill(STRINGS[language][key], vars);
  const clock = (time: string) => formatClock(time, language);
  switch (detail.type) {
    case "closes":
      return text("hours.closes", { time: clock(detail.time) });
    case "always":
      return text("hours.always");
    case "opens":
      return text("hours.opens", { time: clock(detail.time) });
    case "opensTomorrow":
      return text("hours.opensTomorrow", { time: clock(detail.time) });
    case "opensOn":
      return text("hours.opensOn", { time: clock(detail.time), day: text(`day.${detail.day}` as StringKey) });
  }
}

export function formatClock(raw: string, language: Language): string {
  if (language === "en") return raw;
  const match = raw.match(/(\d+)(?::(\d+))?\s*(am|pm)/i);
  if (!match) return raw;
  const minute = (match[2] ?? "00").padStart(2, "0");
  const period = match[3].toLowerCase() === "pm" ? "下午" : "上午";
  return `${period}${match[1]}:${minute}`;
}
