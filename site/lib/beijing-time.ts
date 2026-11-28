export const beijingDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" });

export const beijingDateTime = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  hourCycle: "h23", timeZone: "Asia/Shanghai",
});
