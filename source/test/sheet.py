# contact sheet: python3 test/sheet.py out.jpg cols tile_w img...
import sys
from PIL import Image
out, cols, tw = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]); files = sys.argv[4:]
ims = [Image.open(f).convert('RGB') for f in files]; th = round(tw * ims[0].height / ims[0].width)
rows = (len(ims) + cols - 1) // cols; sh = Image.new('RGB', (cols * tw, rows * th))
for i, im in enumerate(ims): sh.paste(im.resize((tw, th), Image.LANCZOS), ((i % cols) * tw, (i // cols) * th))
sh.save(out, quality=90)
