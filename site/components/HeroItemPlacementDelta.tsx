import "./hero-item-placement-delta.css";

export const heroItemDeltaHint = "同英雄同批样本中，携带此装备的均名减去未携带此装备的均名。负数表示名次更好。";

const signedPlacement = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});

export function formatHeroItemDelta(value: number) {
  return signedPlacement.format(value).replace("-", "−");
}

export function HeroItemPlacementDelta({ value }: { value: number }) {
  const display = formatHeroItemDelta(value);
  return <span className="hero-item-placement-delta" title={heroItemDeltaHint}
    data-tone={display.startsWith("−") ? "good" : display.startsWith("+") ? "weak" : undefined}>
    {display}
  </span>;
}
