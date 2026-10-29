# /tools/mascara.py — Máscara del pelo de la foto del probador (MediaPipe hair segmenter). La usa la Action «Imágenes».
import sys, numpy as np, mediapipe as mp
from PIL import Image
from mediapipe.tasks.python import vision, BaseOptions
src, modelo, out = sys.argv[1:4]
img = mp.Image.create_from_file(src)
seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(base_options=BaseOptions(model_asset_path=modelo), output_confidence_masks=True))
m = seg.segment(img).confidence_masks[-1].numpy_view()
a = (np.clip(m, 0, 1) * 255).astype(np.uint8)
Image.fromarray(a, "L").resize((720, int(720 * a.shape[0] / a.shape[1])), Image.LANCZOS).save(out)
print("máscara", out, a.mean())
