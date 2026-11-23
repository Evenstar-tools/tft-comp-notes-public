import { versionUpdateLink } from "@/domain/version-updates";

export function HomeGuideBanner({ patch }: {
  patch?: { build: string; label: string; updateId: string };
}) {
  return <section className="season-banner" aria-labelledby="home-title">
    <div className="season-banner-copy">
      <div className="season-banner-title">
        <h1 id="home-title">阵容笔记</h1>
        {patch && <a className="season-patch-link" href={versionUpdateLink(patch.updateId)} title={patch.build}>{patch.label}</a>}
      </div>
    </div>
    <div className="season-art" aria-hidden="true"><span className="season-record" /></div>
  </section>;
}
