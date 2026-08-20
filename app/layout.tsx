import type { Metadata } from "next";
import "./globals.css";

export const metadata:Metadata = {
  title:"拾光账本｜图片智能记账",
  description:"上传或粘贴票据图片，在浏览器本地识别并快速完成记账。",
  openGraph:{
    title:"拾光账本",
    description:"拍一下，账就记好了。",
    images:[{ url:"/og.png",width:1792,height:941,alt:"拾光账本图片记账应用" }],
  },
  twitter:{
    card:"summary_large_image",
    title:"拾光账本",
    description:"拍一下，账就记好了。",
    images:["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
