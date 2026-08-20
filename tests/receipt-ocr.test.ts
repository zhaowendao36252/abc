import assert from "node:assert/strict";
import test from "node:test";
import { parseReceipt } from "../app/receiptOcr.ts";

const now=new Date("2026-08-11T12:00:00+08:00");

test("prefers the payable total over tax and item prices",()=>{
  const parsed=parseReceipt(`电子发票
销售方名称：上海瑞幸咖啡有限公司
开票日期：2026年08月10日
商品金额 ¥38.00
税额 2.15
价税合计（小写） ¥40.15`,88.6,now);

  assert.equal(parsed.merchant,"上海瑞幸咖啡有限公司");
  assert.equal(parsed.amount,"40.15");
  assert.equal(parsed.transactionDate,"2026-08-10");
  assert.equal(parsed.category,"餐饮");
  assert.equal(parsed.confidence,89);
});

test("handles full-width text and an amount on the line after its label",()=>{
  const parsed=parseReceipt(`沃尔玛超市
交易日期 ２０２６－０８－０９
优惠 20.00
实付金额
￥ １２８，５０`,76,now);

  assert.equal(parsed.merchant,"沃尔玛超市");
  assert.equal(parsed.amount,"128.50");
  assert.equal(parsed.transactionDate,"2026-08-09");
  assert.equal(parsed.category,"餐饮");
});

test("falls back safely when OCR text has no reliable fields",()=>{
  const parsed=parseReceipt("***\n123456",-4,now);
  assert.equal(parsed.merchant,"待确认商户");
  assert.equal(parsed.amount,"");
  assert.equal(parsed.transactionDate,"2026-08-11");
  assert.equal(parsed.confidence,0);
});
