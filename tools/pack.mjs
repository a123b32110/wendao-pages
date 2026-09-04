// 包体压缩：把 page.js 里两段几十 KB 的客户端模板（CSS、浏览器端 JS）在打包时做一遍 LZ77，
// 沙箱里模块加载时再解回来 —— 解出来的字符串与源码逐字相同（test/build.test.mjs 钉着这一点）。
//
// 编码单位是 JS 字符，输出仍然是一段 String.raw 模板：字面段原样照抄（中文照旧 3 字节），
// 回溯引用写成 3 个「记号字」：[长度][偏移高位][偏移低位]，记号字取 U+0100-02FF 与 U+0400-04FF
// （拉丁扩展 / 西里尔字母，UTF-8 里各占 2 字节，源码里从来不用，也没有 ` 、\ 、$ 这些会
// 打断模板的字符）。一条引用 6 字节，所以只在被引用文本的 UTF-8 长度超过 6 时才划算。
export const SYM = 768;
const enc = (v) => String.fromCharCode(v < 512 ? 0x100 + v : 0x400 + (v - 512));
export const isTok = (c) => (c >= 0x100 && c < 0x300) || (c >= 0x400 && c < 0x500);
const cu8 = (c) => (c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4);

// 发进包里的解码器。故意写成 ES5、单行、无注释：它要经过平台的静态检查，也要能在任何沙箱里跑。
export const UNPACK_NAME = "wdUnpack";
export const UNPACK_SRC = "function wdUnpack(s){var a=[],i=0,n=s.length,c,l,d,p,k,j;var v=function(x){return x<768?x-256:x-512};var t=function(x){return (x>=256&&x<768)||(x>=1024&&x<1280)};while(i<n){c=s.charCodeAt(i);if(t(c)){l=v(c)+3;d=v(s.charCodeAt(i+1))*768+v(s.charCodeAt(i+2))+1;p=a.length-d;for(k=0;k<l;k++)a.push(a[p+k]);i+=3}else{j=i+1;while(j<n&&!t(s.charCodeAt(j)))j++;for(k=i;k<j;k++)a.push(s[k]);i=j}}return a.join(\"\")}";
export const unpack = new Function(UNPACK_SRC + ";return wdUnpack;")();

export function pack(text) {
  const t = text.replace(/\r\n?/g, "\n"); // 模板字面量本来就把 CRLF 归一成 LF
  const n = t.length;
  for (let i = 0; i < n; i++) if (isTok(t.charCodeAt(i))) throw new Error(`pack: text uses a token char U+${t.charCodeAt(i).toString(16)} at ${i}`);
  if (t.includes("`") || t.includes("${")) throw new Error("pack: text contains ` or ${");
  const MAXLEN = SYM + 2;
  const MAXOFF = SYM * SYM;
  const head = new Map();
  const bytesAt = new Uint8Array(n);
  for (let i = 0; i < n; i++) bytesAt[i] = cu8(t.charCodeAt(i));
  const addPos = (p) => { if (p + 3 <= n) { const key = t.substr(p, 3); let l = head.get(key); if (!l) head.set(key, (l = [])); l.push(p); } };
  const findMatch = (i) => {
    if (i + 3 > n) return null;
    const list = head.get(t.substr(i, 3));
    if (!list) return null;
    let best = null, bestGain = 0;
    for (let k = list.length - 1, tries = 0; k >= 0 && tries < 512; k--, tries++) {
      const p = list[k];
      const d = i - p;
      if (d > MAXOFF) break;
      let l = 0, b = 0;
      while (l < MAXLEN && i + l < n && t.charCodeAt(p + l) === t.charCodeAt(i + l)) { b += bytesAt[i + l]; l++; }
      const gain = b - 6;
      if (gain > bestGain) { bestGain = gain; best = { d, l, b }; }
    }
    return best;
  };
  let out = "", i = 0;
  while (i < n) {
    let m = findMatch(i);
    if (m) {
      const m2 = findMatch(i + 1); // 懒匹配：下一位要是能配得更长，先把这一位当字面
      if (m2 && m2.b - 6 > m.b - 6 + bytesAt[i]) { out += t[i]; addPos(i); i++; m = m2; }
      const v = m.d - 1;
      out += enc(m.l - 3) + enc(Math.floor(v / SYM)) + enc(v % SYM);
      for (let k = 0; k < m.l; k++) addPos(i + k);
      i += m.l;
    } else { out += t[i]; addPos(i); i++; }
  }
  if (out.endsWith("\\")) throw new Error("pack: payload ends with a backslash"); // 会把收尾的反引号吃掉
  if (unpack(out) !== t) throw new Error("pack: round trip mismatch");
  return out;
}
