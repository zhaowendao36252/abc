export type ParsedReceipt = {
  merchant:string;
  amount:string;
  transactionDate:string;
  category:string;
  sourceText:string;
  confidence:number;
};

const categoryRules:[string,string[]][] = [
  ["餐饮",["餐","饭","饮","茶","咖啡","食品","超市","便利店","美团","饿了么","肯德基","麦当劳","星巴克","瑞幸"]],
  ["交通",["出租","地铁","公交","滴滴","铁路","航班","停车","加油","高速","充电桩","网约车"]],
  ["购物",["商场","淘宝","天猫","京东","拼多多","服饰","百货","数码","电器"]],
  ["居住",["房租","物业","水费","电费","燃气","宽带","家居"]],
  ["医疗",["医院","诊所","药房","药店","挂号","医疗"]],
  ["娱乐",["电影","影院","游戏","会员","演出","酒店","旅行"]],
  ["教育",["书店","课程","培训","学费","教育","考试"]],
  ["工资",["工资","薪资","奖金","劳务"]],
  ["转账",["转账","收款","付款"]],
];

const fullWidth = "０１２３４５６７８９";
const today = (now:Date) => new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10);

function normalizeLine(value:string) {
  return value
    .replace(/[０-９]/g,(digit)=>String(fullWidth.indexOf(digit)))
    .replace(/[￥]/g,"¥")
    .replace(/[：]/g,":")
    .replace(/[，]/g,",")
    .replace(/[。]/g,".")
    .replace(/[－—]/g,"-")
    .replace(/[／]/g,"/")
    .replace(/[\t ]+/g," ")
    .trim();
}

function numericFriendly(value:string) {
  return normalizeLine(value)
    .replace(/(\d)[Oo](?=\d)/g,(_match,digit:string)=>`${digit}0`)
    .replace(/(\d)[Il](?=\d)/g,(_match,digit:string)=>`${digit}1`);
}

export function inferReceiptCategory(text:string) {
  const normalized=text.toLowerCase();
  return categoryRules.find(([,keywords])=>keywords.some((keyword)=>normalized.includes(keyword)))?.[0] || "其他";
}

function validDate(year:number,month:number,day:number,now:Date) {
  const candidate=new Date(year,month-1,day);
  const tomorrow=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1);
  return year>=2000 && candidate.getFullYear()===year && candidate.getMonth()===month-1 && candidate.getDate()===day && candidate<=tomorrow;
}

function extractDate(lines:string[],now:Date) {
  const patterns = [
    /(20\d{2})\s*[年/.-]\s*(\d{1,2})\s*[月/.-]\s*(\d{1,2})\s*日?/,
    /\b(20\d{2})(\d{2})(\d{2})\b/,
    /\b(\d{2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{1,2})\b/,
  ];
  for (const line of lines) {
    for (const pattern of patterns) {
      const match=numericFriendly(line).match(pattern);
      if (!match) continue;
      const year=match[1].length===2 ? 2000+Number(match[1]) : Number(match[1]);
      const month=Number(match[2]);
      const day=Number(match[3]);
      if (validDate(year,month,day,now)) return `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    }
  }
  return today(now);
}

type AmountCandidate = { value:number; score:number; order:number };

function extractAmount(lines:string[]) {
  const candidates:AmountCandidate[]=[];
  const strongLabel=/(实\s*付|实\s*收|应\s*付|支付金额|付款金额|订单金额|价税合计)/i;
  const totalLabel=/(合\s*计|总\s*计|总金额|消费金额|微信支付|支付宝支付|银行卡支付)/i;
  const weakLabel=/(金额|小计|人民币|rmb)/i;
  const excluded=/(优惠|折扣|立减|找零|税额|税率|单价|余额|积分|原价)/i;
  let order=0;

  lines.forEach((rawLine,index)=>{
    const line=numericFriendly(rawLine);
    const hasLabel=strongLabel.test(line)||totalLabel.test(line)||weakLabel.test(line);
    const source=hasLabel && !/\d/.test(line) && lines[index+1] ? `${line} ${numericFriendly(lines[index+1])}` : line;
    const numberPattern=/(?:¥\s*)?(-?\d{1,7}(?:[.,]\d{1,2})?)/g;
    for (const match of source.matchAll(numberPattern)) {
      const token=match[0];
      const value=Number(match[1].replace(",","."));
      const hasDecimal=/[.,]\d{1,2}/.test(token);
      const hasCurrency=token.includes("¥");
      if (!(hasLabel||hasDecimal||hasCurrency) || value<=0 || value>=10000000) continue;
      let score=strongLabel.test(line)?110:totalLabel.test(line)?95:weakLabel.test(line)?65:10;
      if (excluded.test(line)) score-=130;
      if (hasDecimal) score+=12;
      if (hasCurrency) score+=6;
      candidates.push({ value,score,order:order++ });
    }
  });

  candidates.sort((left,right)=>right.score-left.score || right.value-left.value || right.order-left.order);
  return candidates[0]?.value;
}

function extractMerchant(lines:string[]) {
  const ignored=/(发票|小票|订单|收银|欢迎光临|谢谢惠顾|电话|地址|日期|时间|合计|总计|金额|实付|支付|税号|流水|开票|发票代码|机器编号|交易号|商品|数量|单价)/i;
  const business=/(有限责任公司|有限公司|分公司|商店|超市|便利店|餐厅|饭店|酒店|药房|药店|咖啡|茶饮|中心|商行|百货|影城|书店)/i;
  const labeled=/^(?:商户|商家|销售方名称|销售方|名称)\s*[:：]\s*/i;
  const scored=lines.slice(0,14).map((rawLine,index)=>{
    const wasLabeled=labeled.test(rawLine);
    const line=normalizeLine(rawLine).replace(labeled,"").replace(/^[*#=_\-·•]+|[*#=_\-·•]+$/g,"").trim();
    const letters=(line.match(/[\p{L}]/gu)||[]).length;
    const digits=(line.match(/\d/g)||[]).length;
    let score=24-index*1.5+Math.min(letters,16);
    if (wasLabeled) score+=70;
    if (business.test(line)) score+=55;
    if (/^[\p{L}][\p{L}\s&·.-]+$/u.test(line)) score+=12;
    if (ignored.test(line)||line.length<2||line.length>40||letters<2) score-=120;
    if (digits>letters||/\d+[.,]\d{2}\s*$/.test(line)) score-=35;
    return { line,score };
  }).sort((left,right)=>right.score-left.score);
  return scored[0]?.score>0 ? scored[0].line : "待确认商户";
}

export function parseReceipt(text:string,confidence:number,now=new Date()):ParsedReceipt {
  const sourceText=text.replace(/\r\n/g,"\n").trim();
  const lines=sourceText.split("\n").map(normalizeLine).filter(Boolean);
  const amount=extractAmount(lines);
  return {
    merchant:extractMerchant(lines),
    amount:amount?.toFixed(2)||"",
    transactionDate:extractDate(lines,now),
    category:inferReceiptCategory(lines.join(" ")),
    sourceText,
    confidence:Math.max(0,Math.min(100,Math.round(confidence||0))),
  };
}

/** Resize and contrast-stretch a receipt before OCR. EXIF orientation is applied by createImageBitmap. */
export async function preprocessReceiptImage(file:File):Promise<Blob> {
  const bitmap=await createImageBitmap(file,{ imageOrientation:"from-image" });
  try {
    const longest=Math.max(bitmap.width,bitmap.height);
    const scale=longest>2400 ? 2400/longest : longest<1400 ? Math.min(2,1400/longest) : 1;
    const width=Math.max(1,Math.round(bitmap.width*scale));
    const height=Math.max(1,Math.round(bitmap.height*scale));
    const canvas=document.createElement("canvas");
    canvas.width=width;
    canvas.height=height;
    const context=canvas.getContext("2d",{ alpha:false,willReadFrequently:true });
    if (!context) throw new Error("无法创建图片处理画布");
    context.fillStyle="#fff";
    context.fillRect(0,0,width,height);
    context.imageSmoothingEnabled=true;
    context.imageSmoothingQuality="high";
    context.drawImage(bitmap,0,0,width,height);

    const image=context.getImageData(0,0,width,height);
    const histogram=new Uint32Array(256);
    let samples=0;
    for (let index=0;index<image.data.length;index+=16) {
      const luminance=Math.round(image.data[index]*0.299+image.data[index+1]*0.587+image.data[index+2]*0.114);
      histogram[luminance]+=1;
      samples+=1;
    }
    const percentile=(ratio:number) => {
      const target=samples*ratio;
      let count=0;
      for (let value=0;value<256;value+=1) {
        count+=histogram[value];
        if (count>=target) return value;
      }
      return 255;
    };
    const low=percentile(0.01);
    const high=Math.min(255,Math.max(low+32,percentile(0.99)));
    for (let index=0;index<image.data.length;index+=4) {
      const luminance=image.data[index]*0.299+image.data[index+1]*0.587+image.data[index+2]*0.114;
      const normalized=Math.max(0,Math.min(255,((luminance-low)*255)/(high-low)));
      image.data[index]=normalized;
      image.data[index+1]=normalized;
      image.data[index+2]=normalized;
      image.data[index+3]=255;
    }
    context.putImageData(image,0,0);
    return await new Promise<Blob>((resolve,reject)=>canvas.toBlob((blob)=>blob?resolve(blob):reject(new Error("图片预处理失败")),"image/png"));
  } finally {
    bitmap.close();
  }
}
