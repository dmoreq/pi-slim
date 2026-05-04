/**
 * Lightweight line-hash utilities — extracted from oh-my-pi.
 *
 * Each line in a file is identified by its 1-indexed line number and a short
 * BPE-bigram hash derived from the normalized line text (xxHash32 mod 647).
 * The combined `LINE+ID` reference acts as both an address and a staleness check.
 *
 * Replaces Bun.hash.xxHash32 with xxhash-wasm for cross-runtime compatibility.
 *
 * @module
 */

import xxhash, { type XXHashAPI } from "xxhash-wasm";

// ── Lazy xxhash instance ─────────────────────────────────────────────────

let _xxhash: XXHashAPI | null = null;

/**
 * Ensure the xxhash WASM module is initialized.
 * Call once at startup (or lazily on first hash).
 */
export async function initHash(): Promise<void> {
  if (!_xxhash) {
    _xxhash = await xxhash();
  }
}

function getXxhash(): XXHashAPI {
  if (!_xxhash) throw new Error("Hash not initialized. Call initHash() first.");
  return _xxhash;
}

// ── Bigram Table ──────────────────────────────────────────────────────────

/**
 * 647 single-token BPE bigrams for hashline anchors.
 * Every entry tokenizes as exactly one token in modern BPE vocabularies
 * (cl100k / o200k / Claude family).
 *
 * Order is stable forever — changing it would invalidate every saved
 * `LINE+ID` reference in transcripts and prompts.
 */
export const HASHLINE_BIGRAMS = [
	"aa", "ab", "ac", "ad", "ae", "af", "ag", "ah", "ai", "aj", "ak", "al",
	"am", "an", "ao", "ap", "aq", "ar", "as", "at", "au", "av", "aw", "ax",
	"ay", "az", "ba", "bb", "bc", "bd", "be", "bf", "bg", "bh", "bi", "bj",
	"bk", "bl", "bm", "bn", "bo", "bp", "br", "bs", "bt", "bu", "bv", "bw",
	"bx", "by", "bz", "ca", "cb", "cc", "cd", "ce", "cf", "cg", "ch", "ci",
	"cj", "ck", "cl", "cm", "cn", "co", "cp", "cq", "cr", "cs", "ct", "cu",
	"cv", "cw", "cx", "cy", "cz", "da", "db", "dc", "dd", "de", "df", "dg",
	"dh", "di", "dj", "dk", "dl", "dm", "dn", "do", "dp", "dq", "dr", "ds",
	"dt", "du", "dv", "dw", "dx", "dy", "dz", "ea", "eb", "ec", "ed", "ee",
	"ef", "eg", "eh", "ei", "ej", "ek", "el", "em", "en", "eo", "ep", "eq",
	"er", "es", "et", "eu", "ev", "ew", "ex", "ey", "ez", "fa", "fb", "fc",
	"fd", "fe", "ff", "fg", "fh", "fi", "fj", "fk", "fl", "fm", "fn", "fo",
	"fp", "fq", "fr", "fs", "ft", "fu", "fv", "fw", "fx", "fy", "fz", "ga",
	"gb", "gc", "gd", "ge", "gf", "gg", "gh", "gi", "gj", "gl", "gm", "gn",
	"go", "gp", "gr", "gs", "gt", "gu", "gv", "gw", "gx", "gy", "gz", "ha",
	"hb", "hc", "hd", "he", "hf", "hg", "hh", "hi", "hj", "hk", "hl", "hm",
	"hn", "ho", "hp", "hq", "hr", "hs", "ht", "hu", "hv", "hw", "hx", "hy",
	"hz", "ia", "ib", "ic", "id", "ie", "if", "ig", "ih", "ii", "ij", "ik",
	"il", "im", "in", "io", "ip", "iq", "ir", "is", "it", "iu", "iv", "iw",
	"ix", "iy", "iz", "ja", "jb", "jc", "jd", "je", "jf", "jg", "jh", "ji",
	"jj", "jk", "jl", "jm", "jn", "jo", "jp", "jq", "jr", "js", "jt", "ju",
	"jw", "jx", "jy", "ka", "kb", "kc", "kd", "ke", "kf", "kg", "kh", "ki",
	"kj", "kk", "kl", "km", "kn", "ko", "kp", "kr", "ks", "kt", "ku", "kv",
	"kw", "kx", "ky", "la", "lb", "lc", "ld", "le", "lf", "lg", "lh", "li",
	"lj", "lk", "ll", "lm", "ln", "lo", "lp", "lr", "ls", "lt", "lu", "lv",
	"lw", "lx", "ly", "lz", "ma", "mb", "mc", "md", "me", "mf", "mg", "mh",
	"mi", "mj", "mk", "ml", "mm", "mn", "mo", "mp", "mq", "mr", "ms", "mt",
	"mu", "mv", "mw", "mx", "my", "mz", "na", "nb", "nc", "nd", "ne", "nf",
	"ng", "nh", "ni", "nj", "nk", "nl", "nm", "nn", "no", "np", "nr", "ns",
	"nt", "nu", "nv", "nw", "nx", "ny", "nz", "oa", "ob", "oc", "od", "oe",
	"of", "og", "oh", "oi", "oj", "ok", "ol", "om", "on", "oo", "op", "oq",
	"or", "os", "ot", "ou", "ov", "ow", "ox", "oy", "oz", "pa", "pb", "pc",
	"pd", "pe", "pf", "pg", "ph", "pi", "pj", "pk", "pl", "pm", "pn", "po",
	"pp", "pq", "pr", "ps", "pt", "pu", "pv", "pw", "px", "py", "pz", "qa",
	"qb", "qc", "qd", "qe", "qh", "qi", "ql", "qm", "qn", "qo", "qp", "qq",
	"qr", "qs", "qt", "qu", "qw", "qx", "qy", "ra", "rb", "rc", "rd", "re",
	"rf", "rg", "rh", "ri", "rk", "rl", "rm", "rn", "ro", "rp", "rq", "rr",
	"rs", "rt", "ru", "rv", "rw", "rx", "ry", "rz", "sa", "sb", "sc", "sd",
	"se", "sf", "sg", "sh", "si", "sj", "sk", "sl", "sm", "sn", "so", "sp",
	"sq", "sr", "ss", "st", "su", "sv", "sw", "sx", "sy", "sz", "ta", "tb",
	"tc", "td", "te", "tf", "tg", "th", "ti", "tj", "tk", "tl", "tm", "tn",
	"to", "tp", "tr", "ts", "tt", "tu", "tv", "tw", "tx", "ty", "tz", "ua",
	"ub", "uc", "ud", "ue", "uf", "ug", "uh", "ui", "uj", "uk", "ul", "um",
	"un", "uo", "up", "uq", "ur", "us", "ut", "uu", "uv", "uw", "ux", "uy",
	"uz", "va", "vb", "vc", "vd", "ve", "vf", "vg", "vh", "vi", "vj", "vk",
	"vl", "vm", "vn", "vo", "vp", "vq", "vr", "vs", "vt", "vu", "vv", "vw",
	"vx", "vy", "vz", "wa", "wb", "wc", "wd", "we", "wf", "wg", "wh", "wi",
	"wj", "wk", "wl", "wm", "wn", "wo", "wp", "wr", "ws", "wt", "wu", "wv",
	"ww", "wx", "wy", "xa", "xb", "xc", "xd", "xe", "xf", "xh", "xi", "xl",
	"xm", "xn", "xo", "xp", "xr", "xs", "xt", "xu", "xx", "xy", "xz", "ya",
	"yb", "yc", "yd", "ye", "yf", "yg", "yh", "yi", "yj", "yk", "yl", "ym",
	"yn", "yo", "yp", "yr", "ys", "yt", "yu", "yv", "yw", "yx", "yy", "yz",
	"za", "zb", "zc", "zd", "ze", "zf", "zg", "zh", "zi", "zk", "zl", "zm",
	"zn", "zo", "zp", "zr", "zs", "zt", "zu", "zw", "zx", "zy", "zz",
] as const;

export const HASHLINE_BIGRAMS_COUNT = HASHLINE_BIGRAMS.length; // 647

/**
 * Regex source matching exactly one bigram from HASHLINE_BIGRAMS.
 */
export const HASHLINE_BIGRAM_RE_SRC = `(?:${HASHLINE_BIGRAMS.join("|")})`;

/** Separator between hashline anchor and line content. */
export const HASHLINE_CONTENT_SEPARATOR = "|";

// ── Internal helpers ──────────────────────────────────────────────────────

const RE_SIGNIFICANT = /[\p{L}\p{N}]/u;
const RE_STRUCTURAL_STRIP = /[\s{}]/g;

/**
 * Bigram returned for lines that contain only whitespace and `{`/`}`.
 * Picks the English ordinal suffix for the line number so the
 * line digits + bigram BPE-merge into a single ordinal token.
 */
export function structuralBigram(line: number): string {
  const mod100 = line % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";
  switch (line % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}

// ── Core hashing ──────────────────────────────────────────────────────────

/**
 * Compute a short BPE-bigram hash of a single line.
 *
 * Uses xxHash32 via xxhash-wasm, mapped into HASHLINE_BIGRAMS via modulo.
 * Lines with only whitespace/braces collapse to ordinal-suffix bigram.
 */
export function computeLineHash(idx: number, line: string): string {
  line = line.replace(/\r/g, "").trimEnd();

  if (line.replace(RE_STRUCTURAL_STRIP, "").length === 0) {
    return structuralBigram(idx);
  }

  const seed = !RE_SIGNIFICANT.test(line) ? idx : 0;
  const hexHash = getXxhash().h32ToString(line, seed);
  return HASHLINE_BIGRAMS[Number.parseInt(hexHash, 16) % HASHLINE_BIGRAMS_COUNT];
}

/**
 * Format an anchor reference given a line number and its text.
 * Returns `LINE+ID` (e.g., `42nd`).
 */
export function formatLineHash(line: number, lines: string): string {
  return `${line}${computeLineHash(line, lines)}`;
}

/**
 * Format a single line with hashline anchor.
 * Returns `LINE+ID|TEXT` (e.g., `42nd|function hi() {`).
 */
export function formatHashLine(lineNumber: number, line: string): string {
  return `${lineNumber}${computeLineHash(lineNumber, line)}${HASHLINE_CONTENT_SEPARATOR}${line}`;
}

/**
 * Format file text with hashline prefixes for display.
 *
 * Each line becomes `LINE+ID|TEXT` where line numbers are 1-indexed.
 *
 * @example
 * ```ts
 * formatHashLines("function hi() {\n  return;\n}")
 * // "1tz|function hi() {\n2tr|  return;\n3rd|}"
 * ```
 */
export function formatHashLines(text: string, startLine = 1): string {
  const lines = text.split("\n");
  return lines.map((line, i) => formatHashLine(startLine + i, line)).join("\n");
}
