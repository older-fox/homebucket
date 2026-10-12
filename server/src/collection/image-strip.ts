/**
 * 图片元数据剥离（职责：照片上传给收集服务之前，把 EXIF / GPS / 相机参数 / XMP / ICC 摘干净）。
 *
 * 设计要点：
 *   · **只做字节外科手术，绝不解码重编码**。一旦解码再编码，画质必然损失（有损二次压缩）、
 *     体积与色彩都可能漂移，而元数据剥离本不该改变一个像素——所以这里只在
 *     JPEG 段 / PNG 块 / RIFF 块 这一层做"整段保留或整段丢弃"。
 *     整段进出还顺带保证 CRC 天然有效（PNG/RIFF 的校验值覆盖块内数据，块不被切开就不会失效）。
 *   · **魔数嗅探，不信任任何声明的 mime**。声明的 mime 是客户端给的输入，随手可伪造：
 *     带 GPS 的 JPEG 只要把 Content-Type 改成 image/png，按 mime 分支的代码就会走错路；
 *     魔数是字节本身的事实，改不了。
 *   · **不敢保证无害的格式一律拒收，而不是原样上传**。GIF / HEIC / AVIF / SVG 都塞得进
 *     位置信息或 RDF 元数据，而我们没有能力在纯 JS 里把它们摘干净；
 *     宁可这件物品少一张远端照片，也不能把家庭住址泄露出去。
 */

/** 剥离失败的原因：不是这三种格式 / 能识别但处理不了 / 结构坏了 */
export type StripReason = 'notAnImage' | 'unsupported' | 'malformed';

export type StripResult =
  | { ok: true; bytes: Buffer; mime: string; removedSegments: number }
  | { ok: false; reason: StripReason; mime: string };

/** 嗅不出类型时回填的 mime——什么都认不出来就别编一个具体类型 */
const OCTET_STREAM = 'application/octet-stream';

/** 嗅探结论：可处理的三种、识别得到但处理不了的、完全不认识的 */
type Sniff =
  | { kind: 'jpeg' | 'png' | 'webp'; mime: string }
  | { kind: 'unsupported' | 'notAnImage'; mime: string };

/** 各格式函数只管字节，mime 统一由嗅探结果回填 */
interface StrippedBytes {
  bytes: Buffer;
  removedSegments: number;
}

/** 取 4 字节 fourcc；越界返回空串，天然判负（省掉一堆长度判断） */
function fourccAt(input: Buffer, offset: number): string {
  return offset + 4 <= input.length ? input.toString('latin1', offset, offset + 4) : '';
}

/**
 * 只认魔数。 declarations（Content-Type / 文件扩展名）一概不看，理由见文件头。
 *
 * 顺序有讲究：先认三种可处理格式，再认"认识但处理不了"的格式（GIF/HEIC/AVIF/SVG），
 * 剩下的才归为 notAnImage——否则 GIF 会被当成普通未知文件，上层拿到的原因就失去意义了。
 */
function sniff(input: Buffer): Sniff {
  // JPEG: FF D8 FF
  if (input.length >= 3 && input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff) {
    return { kind: 'jpeg', mime: 'image/jpeg' };
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    input.length >= 8 &&
    input.readUInt32BE(0) === 0x89504e47 &&
    input.readUInt32BE(4) === 0x0d0a1a0a
  ) {
    return { kind: 'png', mime: 'image/png' };
  }
  // WebP: RIFF....WEBP
  if (fourccAt(input, 0) === 'RIFF' && fourccAt(input, 8) === 'WEBP') {
    return { kind: 'webp', mime: 'image/webp' };
  }

  // GIF（87a / 89a）：能识别，但我们不处理——注释块和 XMP 都能带位置信息
  if (fourccAt(input, 0) === 'GIF8') return { kind: 'unsupported', mime: 'image/gif' };

  // HEIC / AVIF：ISO-BMFF 容器，<size:4>ftyp<brands...>
  if (fourccAt(input, 4) === 'ftyp') {
    const brands = input.subarray(8, Math.min(input.length, 8 + 64)).toString('latin1');
    // avif 的兼容品牌里通常也带 mif1，所以先判 avif 再落到 heic
    const avif = brands.indexOf('avif') >= 0 || brands.indexOf('avis') >= 0;
    return { kind: 'unsupported', mime: avif ? 'image/avif' : 'image/heic' };
  }

  // SVG：本质是 XML，可以内嵌 RDF 元数据与坐标，不在纯 JS 外科手术的能力范围内
  const raw = input.subarray(0, Math.min(input.length, 512)).toString('utf8');
  const head = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw; // 容忍 utf-8 BOM
  if (/^\s*(<\?xml|<svg|<!doctype\s+svg)/i.test(head)) {
    return { kind: 'unsupported', mime: 'image/svg+xml' };
  }

  return { kind: 'notAnImage', mime: OCTET_STREAM };
}

/**
 * JPEG：SOI + 保留段 + SOS 起整段照抄。
 *
 * 元数据只住在 APPn（APP1=EXIF、APP2=FlashPix/ICC、其余 APPn 各家自定义）与 COM 里，
 * 所以这两个之外的段一律保留：丢掉 DQT/DHT/SOF 这些结构段会直接让图打不开，
 * 而它们不带隐私。未列出的其他段（DAC/DNL/EXP 等）同样保留——丢未知结构段的风险
 * （解不出图）远大于收益（它们不是元数据的藏身处）。
 */
function jpegKeeps(marker: number): boolean {
  /*
   * 已知取舍：这里连 APP14（0xEE，Adobe 色彩变换）一起去掉了，因为"丢掉全部 APPn"
   * 是唯一能保证不遗漏元数据的规则。代价是 CMYK/YCCK 编码的 JPEG 少了 APP14 之后
   * 解码器可能把颜色通道解释错（偏色）。
   *
   * 接受这个代价：这类图基本只出自印刷流程，手机/相机直出的照片是 YCbCr，
   * 不依赖 APP14；而逐个白名单 APPn 的风险是漏掉某一家的私有元数据块，
   * 那才是这个函数存在的意义。真遇到偏色再按"保留 0xEE"单独放行。
   */
  if (marker >= 0xe1 && marker <= 0xef) return false; // APP1..APP15（APP0/JFIF 不在内，要保留）
  if (marker === 0xfe) return false; // COM 注释
  return true;
}

function stripJpeg(input: Buffer): StrippedBytes | null {
  const parts: Buffer[] = [input.subarray(0, 2)]; // SOI
  let offset = 2;
  let removed = 0;
  let tail = -1; // SOS / EOI 的位置，找不到就是结构坏了

  while (offset + 1 < input.length) {
    if (input[offset] !== 0xff) return null; // 段不是从 0xFF 起：结构已坏

    const marker = input[offset + 1];
    // 标记前允许插任意个 0xFF 填充字节，逐字节跳过（每次至少前进 1，不会死循环）
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    // 无长度字段的独立标记：TEM 与重启标记 RSTn
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(input.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }

    // SOS / EOI 之后是熵编码数据，见下面的"整段照抄"说明
    if (marker === 0xda || marker === 0xd9) {
      tail = offset;
      break;
    }

    if (offset + 4 > input.length) return null;
    const length = input.readUInt16BE(offset + 2);
    // 长度含自身那 2 字节，所以 <2 或越过末尾都是坏文件
    if (length < 2 || offset + 2 + length > input.length) return null;

    const segment = input.subarray(offset, offset + 2 + length);
    if (jpegKeeps(marker)) parts.push(segment);
    else removed += 1;
    offset += 2 + length;
  }

  // 走到末尾也没见到 SOS/EOI = 头部被截断，判 malformed 而不是吐一个不完整的图
  if (tail < 0) return null;

  /*
   * SOS 之后必须整段照抄，一个字节都不能解析：熵编码数据里靠 FF00 做字节填充，
   * 随时可能出现 FF D8 / FF E1 这样的"假标记"。继续按段解析就会把扫描数据当成
   * 元数据段切掉——这是破坏 JPEG 的头号方式。
   */
  parts.push(input.subarray(tail));

  return { bytes: Buffer.concat(parts), removedSegments: removed };
}

/**
 * PNG 保留清单：只留渲染必需的块。
 * 颜色/透明相关（cHRM/gAMA/iCCP/sRGB/sBIT/bKGD/PLTE/tRNS）必须留下，抽掉会让
 * 同一张图在别处变色或丢失透明——那等于改了图，违背"只摘元数据"的初衷。
 * 其余（eXIf / tEXt / zTXt / iTXt / tIME / pHYs / sPLT / hIST / 未知块）全丢。
 */
const PNG_KEEP = new Set([
  'IHDR',
  'PLTE',
  'tRNS',
  'cHRM',
  'gAMA',
  'iCCP',
  'sRGB',
  'sBIT',
  'bKGD',
  'IDAT',
  'IEND',
]);

function stripPng(input: Buffer): StrippedBytes | null {
  const parts: Buffer[] = [input.subarray(0, 8)]; // 签名
  let offset = 8;
  let removed = 0;

  while (offset + 8 <= input.length) {
    const length = input.readUInt32BE(offset);
    const type = input.toString('latin1', offset + 4, offset + 8);
    // 每块固定 12 字节开销（len+type+crc）；声明长度越过末尾即为截断
    if (length > input.length - offset - 12) return null;

    const end = offset + 12 + length; // length 可能为 0，但 12 的开销保证一定前进
    const chunk = input.subarray(offset, end);
    /*
     * 按原顺序逐块搬运，绝不重排或合并 IDAT：块顺序本身是语义
     * （PLTE 必须在 IDAT 前，多个 IDAT 的先后就是扫描线顺序），
     * 重排会直接把图打花。
     */
    if (PNG_KEEP.has(type)) parts.push(chunk);
    else removed += 1;

    if (type === 'IEND') return { bytes: Buffer.concat(parts), removedSegments: removed };
    offset = end;
  }

  return null; // 没读到 IEND：文件被截断
}

/** WebP 里承载元数据的块：EXIF、XMP（注意 fourcc 带尾空格）、ICC */
const WEBP_DROP = new Set(['EXIF', 'XMP ', 'ICCP']);

/** VP8X flags：bit3=EXIF、bit2=XMP，两个一起清掉（0x0C），其余位（ALPHA/ANIM）原样保留 */
const VP8X_METADATA_FLAGS = 0x0c;

const RIFF_FOURCC = Buffer.from('RIFF', 'latin1');
const WEBP_FOURCC = Buffer.from('WEBP', 'latin1');
/** RIFF 块按偶数字节对齐，奇数长度补的这个字节可以是任意值，统一补 0 */
const RIFF_PAD = Buffer.from([0]);

/** 手写 4 字节小端长度（RIFF 的 size 是 LE，正好和 PNG 的 BE 相反） */
function le32(value: number): Buffer {
  return Buffer.from([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
}

function stripWebp(input: Buffer): StrippedBytes | null {
  const parts: Buffer[] = [];
  let offset = 12; // 跳过 RIFF 头（4+4）与 WEBP fourcc
  let removed = 0;

  while (offset + 8 <= input.length) {
    const fourcc = input.toString('latin1', offset, offset + 4);
    const size = input.readUInt32LE(offset + 4);
    if (size > input.length - offset - 8) return null;

    const header = input.subarray(offset, offset + 8); // fourcc + size，原样带走
    const data = input.subarray(offset + 8, offset + 8 + size);
    // RIFF 块按偶数字节对齐，奇数长度后面跟 1 个填充字节：它属于这个块，丢弃时要一起丢
    const pad = size % 2;

    if (WEBP_DROP.has(fourcc)) {
      removed += 1;
    } else {
      if (fourcc === 'VP8X' && size >= 1) {
        /*
         * 扩展型 WebP 在 VP8X 的 flags 里声明"本图含 EXIF / XMP"。
         * 块已经删了却留着这两个位，等于文件自相矛盾，严格解析器会直接判非法；
         * 所以只清 0x0C，透明度/动画那些位一个都不动。
         */
        const patched = Buffer.from(data); // 复制一份，绝不就地改调用方的 Buffer
        patched[0] &= ~VP8X_METADATA_FLAGS;
        parts.push(header, patched);
      } else {
        parts.push(header, data);
      }
      if (pad === 1) parts.push(RIFF_PAD);
    }

    offset += 8 + size + pad; // size 为 0 时也靠 8 字节块头前进，不会死循环
  }

  // 块的增删会改变容器长度，RIFF 头的 size 必须重算（= 总长 − 8），否则文件头自相矛盾。
  // 12 = RIFF(4) + size(4) + WEBP(4)，所以 size 就是后面这段内容的长度 + 4（WEBP fourcc）
  const body = Buffer.concat(parts);
  const bytes = Buffer.concat([RIFF_FOURCC, le32(body.length + 4), WEBP_FOURCC, body]);

  return { bytes, removedSegments: removed };
}

/** 剥离图片元数据（EXIF/GPS/相机参数/XMP/ICC）；无法安全处理的格式返回 ok:false */
export function stripImageMetadata(input: Buffer): StripResult {
  const sniffed = sniff(input);
  if (sniffed.kind === 'notAnImage') return { ok: false, reason: 'notAnImage', mime: sniffed.mime };
  if (sniffed.kind === 'unsupported') return { ok: false, reason: 'unsupported', mime: sniffed.mime };

  const stripped =
    sniffed.kind === 'jpeg'
      ? stripJpeg(input)
      : sniffed.kind === 'png'
        ? stripPng(input)
        : stripWebp(input);
  if (!stripped) return { ok: false, reason: 'malformed', mime: sniffed.mime };

  return {
    ok: true,
    bytes: stripped.bytes,
    mime: sniffed.mime,
    removedSegments: stripped.removedSegments,
  };
}
