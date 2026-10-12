/**
 * 图片元数据扫描（纯函数，零依赖）。
 *
 * ── 为什么要扫 ──
 * 收集器公开承诺"不收存放位置"（见 README 的"只收公共信息"），但一张货架照片的
 * EXIF 里可能就带着 GPS 坐标、光圈、机身序列号 —— 那等于绕过了这条承诺。
 * 上报端（HomeBucket）负责先剥离，这里负责**拒收残留**：剥离器一旦失效，
 * 拒收就是警报；若改成"服务端顺手剥离"，坏掉的剥离器就永远不会被发现。
 *
 * ── 覆盖范围 ──
 * JPEG（APP1/Exif 与 APP1/XMP、APP2/ICC、APP13/IPTC）、PNG（eXIf、iTXt:XMP）、
 * WebP（EXIF / XMP / ICCP 三个 RIFF chunk）。GIF 没有标准化的 EXIF 容器，
 * 本版本不判（上传端同样跳过 GIF）。
 *
 * 只做检测、不做解析：不需要知道"光圈是多少"，只需要知道"元数据还在不在"。
 */

export type MetadataKind = 'exif' | 'xmp' | 'iptc' | 'icc';

export interface MetadataScan {
  /** 是否发现任何应当被剥离的元数据块 */
  present: boolean;
  /** 命中的元数据种类（去重） */
  kinds: MetadataKind[];
  /** 命中的具体位置，例如 `jpeg:APP1/Exif`、`png:eXIf`、`webp:EXIF`；原样进错误信息 */
  segments: string[];
}

const EMPTY: MetadataScan = { present: false, kinds: [], segments: [] };

function resultOf(segments: string[]): MetadataScan {
  const unique = [...new Set(segments)];
  const kinds: MetadataKind[] = [];
  for (const segment of unique) {
    const kind = segment.split('/')[1]?.toLowerCase() as MetadataKind | undefined;
    if (kind && !kinds.includes(kind)) kinds.push(kind);
  }
  return { present: unique.length > 0, kinds, segments: unique };
}

/** JPEG：从 SOI 之后按 marker 走，遇 SOS 就停（熵编码段不能再当结构解析） */
function scanJpeg(bytes: Buffer): string[] {
  const found: string[] = [];
  let offset = 2;

  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1] as number;

    // 无长度字段的 marker：SOI / TEM / RSTn / EOI
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      if (marker === 0xda || marker === 0xd9) break; // SOS / EOI：后面不再有段结构
      offset += 2;
      continue;
    }

    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2) break;
    const payload = bytes.subarray(offset + 4, Math.min(offset + 4 + length - 2, bytes.length));

    if (marker === 0xe1) {
      if (payload.subarray(0, 6).toString('latin1') === 'Exif\0\0') found.push('jpeg:APP1/Exif');
      else if (payload.subarray(0, 29).toString('latin1') === 'http://ns.adobe.com/xap/1.0/\0') {
        found.push('jpeg:APP1/XMP');
      }
    } else if (marker === 0xe2) {
      const head = payload.subarray(0, 12).toString('latin1');
      if (head.startsWith('FPXR')) found.push('jpeg:APP2/Exif');
      else if (head.startsWith('ICC_PROFILE')) found.push('jpeg:APP2/ICC');
    } else if (marker === 0xed) {
      if (payload.subarray(0, 14).toString('latin1').startsWith('Photoshop 3.0')) {
        found.push('jpeg:APP13/IPTC');
      }
    }

    offset += 2 + length;
  }

  return found;
}

/** PNG：整块取舍，所以只看块类型（iTXt 还要看关键字是不是 XMP） */
function scanPng(bytes: Buffer): string[] {
  const found: string[] = [];
  let offset = 8;

  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString('latin1');
    const dataStart = offset + 8;
    const dataEnd = Math.min(dataStart + length, bytes.length);

    if (type === 'eXIf') found.push('png:eXIf/Exif');
    else if (type === 'iTXt') {
      // iTXt 布局：<keyword\0><compressionFlag>...；XMP 的关键字是固定的
      const data = bytes.subarray(dataStart, dataEnd);
      const end = data.indexOf(0);
      if (end > 0 && data.subarray(0, end).toString('latin1') === 'XML:com.adobe.xmp') {
        found.push('png:iTXt/XMP');
      }
    } else if (type === 'IEND') break;

    // +4 是 CRC
    offset = dataEnd + 4;
  }

  return found;
}

/**
 * WebP：按 RIFF chunk 扫，而**不看 VP8X 的标志位**。
 * 标志位是声明性的、可能与真实 chunk 不一致（既有假阳性也有假阴性），
 * chunk 才是实际内容。
 */
function scanWebp(bytes: Buffer): string[] {
  const found: string[] = [];
  let offset = 12;

  while (offset + 8 <= bytes.length) {
    const fourcc = bytes.subarray(offset, offset + 4).toString('latin1');
    const size = bytes.readUInt32LE(offset + 4);

    if (fourcc === 'EXIF') found.push('webp:EXIF/Exif');
    else if (fourcc === 'XMP ') found.push('webp:XMP/XMP');
    else if (fourcc === 'ICCP') found.push('webp:ICCP/ICC');

    // chunk 数据按 2 字节对齐
    offset += 8 + size + (size % 2);
  }

  return found;
}

export function scanImageMetadata(bytes: Buffer): MetadataScan {
  if (bytes.length < 12) return EMPTY;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return resultOf(scanJpeg(bytes));
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes.subarray(1, 4).toString('latin1') === 'PNG' &&
    bytes.subarray(4, 8).toString('latin1') === '\r\n\x1a\n'
  ) {
    return resultOf(scanPng(bytes));
  }

  // WebP: RIFF....WEBP
  if (bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') {
    return resultOf(scanWebp(bytes));
  }

  // 其它格式（GIF 等）没有标准化的 EXIF 容器：不判，交给上传端自行跳过
  return EMPTY;
}
