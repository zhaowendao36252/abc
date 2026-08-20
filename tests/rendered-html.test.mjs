import assert from "node:assert/strict";
import { access,readFile } from "node:fs/promises";
import test from "node:test";

test("production bundle contains the manual receipt ledger experience",async()=>{
  const appSource = await readFile(new URL("../app/LedgerApp.tsx",import.meta.url),"utf8");
  const serverBundle = await readFile(new URL("../dist/server/index.js",import.meta.url),"utf8");

  assert.match(appSource,/api\/transactions/);
  assert.match(appSource,/mergeLedgerItems/);
  assert.match(appSource,/writeLocalLedger\(merged\)/);
  assert.match(appSource,/拍照或上传票据/);
  assert.match(appSource,/startEditing/);
  assert.match(appSource,/保存修改/);
  assert.match(appSource,/method:"PUT"/);
  assert.match(appSource,/preprocessReceiptImage/);
  assert.match(appSource,/createWorker/);
  assert.match(appSource,/已报销专区/);
  assert.match(appSource,/updateReimbursement/);
  assert.match(appSource,/method:"PATCH"/);
  assert.match(appSource,/deletePerson/);
  assert.match(appSource,/删除建档人/);
  assert.match(appSource,/api\/persons\?id=/);
  assert.match(appSource,/response\.status!==404/);
  assert.doesNotMatch(appSource,/codex-preview|SkeletonPreview/);
  assert.match(serverBundle,/api\/transactions/);
  await access(new URL("../dist/client/og.png",import.meta.url));
});
