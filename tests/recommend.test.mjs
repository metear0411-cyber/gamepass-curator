// 추천 엔진 회귀 테스트: node tests/recommend.test.mjs (Node 18 이상, 설치할 패키지 없음)
// 사례는 tests/cases.js에 있고 브라우저용 tests/run.html도 같은 사례를 돌린다
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Recommend = require('../docs/recommend.js');
const { run } = require('./cases.js');
const fixture = require('./fixture.json');

const t = {
  ok: (cond, msg) => assert.ok(cond, msg),
  equal: (actual, expected, msg) => assert.strictEqual(actual, expected, msg)
};

const results = run(Recommend, fixture, t);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `\n      ${r.error}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} 통과`);
process.exitCode = failed ? 1 : 0;
