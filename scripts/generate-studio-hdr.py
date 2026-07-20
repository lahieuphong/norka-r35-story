#!/usr/bin/env python3
from pathlib import Path
import math
import cv2
import numpy as np
W,H=1024,512
u=np.linspace(-math.pi,math.pi,W,endpoint=False,dtype=np.float32)
v=np.linspace(math.pi/2,-math.pi/2,H,endpoint=False,dtype=np.float32)
lon,lat=np.meshgrid(u,v)
img=np.zeros((H,W,3),dtype=np.float32)+np.array([0.016,0.018,0.022],dtype=np.float32)
img+=np.exp(-((lat/0.52)**2))[...,None]*np.array([0.075,0.078,0.085],dtype=np.float32)
def delta(a,c): return np.arctan2(np.sin(a-c),np.cos(a-c))
def panel(lo,la,ww,hh,intensity,rgb,edge=6):
 d=(np.abs(delta(lon,lo))/ww)**edge+(np.abs(lat-la)/hh)**edge
 img[:]+=np.exp(-d*2.2)[...,None]*np.array(rgb,dtype=np.float32)*intensity
panel(math.radians(-48),math.radians(8),.42,.28,13,(1,.96,.91))
panel(math.radians(53),math.radians(12),.34,.24,8.5,(.86,.92,1))
panel(math.radians(4),math.radians(66),.72,.13,17,(1,.98,.94),8)
panel(math.radians(145),math.radians(15),.25,.32,7.5,(1,.24,.18))
panel(math.radians(-150),math.radians(20),.25,.30,6,(.38,.55,1))
rear=np.exp(-((np.abs(delta(lon,math.pi))/.72)**6+((lat+.02)/.10)**6)*2)
img+=rear[...,None]*np.array([2.8,2.9,3.1],dtype=np.float32)
img*=1-np.clip((-lat-.12)/.7,0,1)[...,None]*.55
out=Path(__file__).resolve().parents[1]/'public/hdr/automotive-studio.hdr'
out.parent.mkdir(parents=True,exist_ok=True)
if not cv2.imwrite(str(out),np.maximum(img,0)[...,::-1]): raise SystemExit('HDR write failed')
print(out)
