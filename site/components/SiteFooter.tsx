import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { BrandMark } from "./Glyphs";
import "./site-footer.css";

const references: { label: string; links: { name: string; href: string; logo?: string }[] }[] = [
  { label: "国内数据站", links: [
    { name: "DataTFT", href: "https://www.datatft.com/", logo: "/footer/datatft.webp" },
    { name: "TFTable", href: "https://tftable.cc/meta" },
    { name: "猫咪 TFT", href: "https://maomitft.com/" },
  ] },
  { label: "海外参考", links: [
    { name: "MetaTFT", href: "https://www.metatft.com/" },
    { name: "TFT Academy", href: "https://tftacademy.com/" },
    { name: "NoxuTFT", href: "https://noxutft.com/zh/tft-traits" },
  ] },
];

export function SiteFooter({ siteName, brandIcon }: { siteName: string; brandIcon: string }) {
  return <footer className="site-footer">
    <div className="site-footer-inner">
      <div className="site-footer-identity">
        <BrandMark size={30} src={brandIcon} />
        <div>
          <p className="site-footer-name">{siteName}</p>
          <a className="site-footer-profile" href="https://space.bilibili.com/9281359" target="_blank" rel="noreferrer">
            B 站主页 <ArrowUpRight size={15} aria-hidden />
          </a>
        </div>
      </div>
      {references.map(group => <nav key={group.label} className="site-footer-group" aria-label={group.label}>
        <h2>{group.label}</h2>
        <ul role="list">{group.links.map(({ name, href, logo }) => <li key={name}>
          <a href={href} target="_blank" rel="noreferrer">
            {logo && <Image src={logo} width={20} height={20} alt="" unoptimized />}
            {name}
          </a>
        </li>)}</ul>
      </nav>)}
    </div>
  </footer>;
}
