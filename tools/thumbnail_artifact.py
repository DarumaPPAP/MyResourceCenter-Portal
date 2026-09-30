"""Bounded, static presentation images; never accepts an arbitrary image format."""
from __future__ import annotations
import re
import shutil
import struct
import tempfile
import zlib
from pathlib import Path

MAX_BYTES=4*1024*1024
WEBP_EDGE=1200
WEBP_QUALITY=85


def stable_thumbnail_path(value, document_id):
    return (isinstance(value,str) and re.fullmatch(r'DOC-[A-Za-z0-9_-]+',str(document_id)) is not None
            and value in {f'assets/generated/documents/{document_id}.png',f'assets/generated/documents/{document_id}.webp'})


def no_symlink_path(path, root):
    path=Path(path);root=Path(root)
    return (path.is_file() and path.resolve().is_relative_to(root.resolve())
            and not any(p.is_symlink() for p in [path,*path.parents] if p.is_relative_to(root)))


def valid_png(data):
    # Generated lossless pages use non-interlaced grayscale/RGB(A), with no
    # ancillary metadata or animation chunks. Decode their complete zlib stream
    # without requiring Pillow, so codec-absent PNG fallback remains usable.
    if not data.startswith(b'\x89PNG\r\n\x1a\n'):return False
    offset=8;first=True;compressed=bytearray()
    while offset+12<=len(data):
        length=struct.unpack('>I',data[offset:offset+4])[0]
        kind=data[offset+4:offset+8];end=offset+12+length
        if end>len(data) or kind not in {b'IHDR',b'IDAT',b'IEND',b'pHYs'}:return False
        payload=data[offset+8:end-4]
        if zlib.crc32(kind+payload)&0xffffffff!=struct.unpack('>I',data[end-4:end])[0]:return False
        if first:
            if kind!=b'IHDR' or length!=13:return False
            width,height,depth,color,compression,filtering,interlace=struct.unpack('>IIBBBBB',payload)
            channels={0:1,2:3,4:2,6:4}.get(color)
            depths={1,2,4,8,16} if color==0 else {8,16}
            if not (1<=width<=4096 and 1<=height<=4096) or channels is None or depth not in depths:return False
            if compression or filtering or interlace:return False
            stride=1+(width*channels*depth+7)//8;expected=stride*height
            first=False
        elif kind==b'IHDR':return False
        if kind==b'pHYs' and (length!=9 or payload[8] not in {0,1}):return False
        if kind==b'IDAT':compressed.extend(payload)
        if kind==b'IEND':
            if length or end!=len(data) or not compressed:return False
            try:
                decoder=zlib.decompressobj()
                pixels=decoder.decompress(compressed,expected+1)
            except zlib.error:return False
            return (len(pixels)==expected and decoder.eof and not decoder.unused_data
                    and not decoder.unconsumed_tail
                    and all(pixels[i] in range(5) for i in range(0,expected,stride)))
        offset=end
    return False


def valid_webp(data):
    if len(data)<20 or data[:4]!=b'RIFF' or data[8:12]!=b'WEBP':return False
    if struct.unpack('<I',data[4:8])[0]+8!=len(data):return False
    offset=12;frames=0
    while offset+8<=len(data):
        kind=data[offset:offset+4];length=struct.unpack('<I',data[offset+4:offset+8])[0]
        end=offset+8+length
        if kind not in {b'VP8 ',b'VP8L',b'VP8X',b'ALPH'} or end+(length%2)>len(data):return False
        if kind in {b'VP8 ',b'VP8L'}:frames+=1
        if length%2 and data[end]!=0:return False
        offset=end+(length%2)
    if offset!=len(data) or frames!=1:return False
    # Full bitstream decode is mandatory for WebP. Missing codec fails closed.
    try:
        import io
        from PIL import Image
    except ImportError:return False
    try:
        with Image.open(io.BytesIO(data)) as image:
            if image.format!='WEBP' or getattr(image,'is_animated',False):return False
            if not (1<=image.width<=WEBP_EDGE and 1<=image.height<=WEBP_EDGE):return False
            image.load()
        return True
    except (OSError,ValueError,RuntimeError,Image.DecompressionBombError):return False


def validate_thumbnail_asset(path):
    path=Path(path)
    if path.is_symlink() or not path.is_file() or not 24<=path.stat().st_size<=MAX_BYTES:return False
    data=path.read_bytes()
    if path.suffix=='.png':return valid_png(data)
    if path.suffix=='.webp':return valid_webp(data)
    return False


def write_delivery_thumbnail(rendered_png, output_dir, document_id):
    """Encode full page at85 quality; preserve PNG only when WebP codec is absent."""
    if re.fullmatch(r'DOC-[A-Za-z0-9_-]+',str(document_id)) is None:raise ValueError('invalid stable DOC identity')
    rendered_png=Path(rendered_png);output_dir=Path(output_dir)
    if not validate_thumbnail_asset(rendered_png):raise ValueError('invalid lossless rendering artifact')
    output_dir.mkdir(parents=True,exist_ok=True)
    try:
        from PIL import Image,features
        webp_available=features.check('webp')
    except ImportError:webp_available=False
    extension='webp' if webp_available else 'png'
    destination=output_dir/f'{document_id}.{extension}'
    with tempfile.TemporaryDirectory(prefix='.delivery-',dir=output_dir) as temporary:
        candidate=Path(temporary)/f'page.{extension}'
        if webp_available:
            with Image.open(rendered_png) as image:
                image.load();image.thumbnail((WEBP_EDGE,WEBP_EDGE),Image.Resampling.LANCZOS)
                if image.mode not in {'RGB','RGBA'}:image=image.convert('RGB')
                image.save(candidate,'WEBP',quality=WEBP_QUALITY,method=6)
        else:shutil.copyfile(rendered_png,candidate)
        if not validate_thumbnail_asset(candidate):raise ValueError('invalid delivery thumbnail')
        candidate.replace(destination)
    return f'assets/generated/documents/{document_id}.{extension}'
