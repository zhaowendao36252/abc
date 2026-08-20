import type { Metadata } from "next";
import LedgerApp from "./LedgerApp";

export const metadata: Metadata = {
  title: "拾光账本｜图片智能记账",
  description: "识别票据图片，校正信息并沉淀为清晰账目。",
};

export default function Home() {
  return <LedgerApp />;
}
