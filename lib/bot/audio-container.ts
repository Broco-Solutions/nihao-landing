/** Inspect actual container metadata, never infer audio from the MIME or magic alone. */
export function audioContainerHasOnlyAudio(body: Uint8Array, container: "mp4" | "webm"): boolean {
  let audio = false; let video = false; let elements = 0;
  const text = (start: number, end: number) => new TextDecoder().decode(body.subarray(start, end));
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const mp4 = (start: number, end: number, depth = 0): boolean => {
    if (depth > 8) return false;
    for (let at = start; at < end;) {
      if (++elements > 10_000 || at + 8 > end) return false;
      let size = view.getUint32(at); let header = 8;
      if (size === 1) { if (at + 16 > end) return false; const large = view.getBigUint64(at + 8); if (large > BigInt(Number.MAX_SAFE_INTEGER)) return false; size = Number(large); header = 16; }
      if (size === 0) size = end - at;
      if (size < header || at + size > end) return false;
      const type = text(at + 4, at + 8); const data = at + header;
      if (["moov", "trak", "mdia"].includes(type) && !mp4(data, at + size, depth + 1)) return false;
      if (type === "hdlr" && depth >= 3) {
        if (data + 12 > at + size) return false;
        const handler = text(data + 8, data + 12);
        if (handler === "soun") audio = true;
        else if (handler === "vide") video = true;
      }
      at += size;
    }
    return true;
  };
  const vint = (at: number, isId: boolean): { value: number; length: number; unknown: boolean } | null => {
    if (at >= body.length || body[at] === 0) return null;
    let length = 1; let mask = 0x80;
    while (!(body[at] & mask)) { length++; mask >>= 1; }
    if (length > (isId ? 4 : 8) || at + length > body.length) return null;
    let value = isId ? body[at] : body[at] & (mask - 1);
    let unknown = !isId && value === mask - 1;
    for (let index = 1; index < length; index++) { value = value * 256 + body[at + index]; unknown &&= body[at + index] === 255; }
    if (!unknown && !Number.isSafeInteger(value)) return null;
    return { value, length, unknown };
  };
  const webm = (start: number, end: number, depth = 0, track = false): boolean => {
    if (depth > 8) return false;
    for (let at = start; at < end;) {
      if (++elements > 10_000) return false;
      const id = vint(at, true); if (!id) return false;
      const size = vint(at + id.length, false); if (!size) return false;
      const data = at + id.length + size.length;
      const finish = size.unknown ? end : data + size.value;
      if (finish > end || finish < data) return false;
      if ([0x18538067, 0x1654ae6b, 0xae].includes(id.value) && !webm(data, finish, depth + 1, id.value === 0xae)) return false;
      if (id.value === 0x83 && track) {
        if (finish - data < 1 || finish - data > 8) return false;
        let type = 0; for (let index = data; index < finish; index++) type = type * 256 + body[index];
        if (type === 1) video = true; else if (type === 2) audio = true;
      }
      at = finish;
    }
    return true;
  };
  return (container === "mp4" ? mp4(0, body.length) : webm(0, body.length)) && audio && !video;
}
