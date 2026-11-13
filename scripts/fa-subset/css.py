import json,re,sys,os
ROOT=os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..'))+'/'
SP=sys.argv[1];P=ROOT+'public/vendor/fa/'
r=json.load(open(SP+'/ranges.json'))
css=open(P+'all.local.min.css').read()
spec=[('Font Awesome 6 Brands',400,'brands-400'),('Font Awesome 6 Free',400,'regular-400'),('Font Awesome 6 Free',900,'solid-900')]
for fam,w,k in spec:
    pat=re.compile(r'@font-face\{font-family:"%s";font-style:normal;font-weight:%d;font-display:block;src:url\(/vendor/fa/webfonts/fa-%s\.woff2\) format\("woff2"\),url\(/vendor/fa/webfonts/fa-%s\.ttf\) format\("truetype"\)\}'%(fam,w,k,k))
    base='font-family:"%s";font-style:normal;font-weight:%d;font-display:block;'%(fam,w)
    new=('@font-face{%ssrc:url(/vendor/fa/webfonts/fa-%s.woff2) format("woff2"),url(/vendor/fa/webfonts/fa-%s.ttf) format("truetype");unicode-range:%s}\n'
         '@font-face{%ssrc:url(/vendor/fa/webfonts/fa-%s.subset.woff2) format("woff2");unicode-range:%s}')%(base,k,k,r[k]['full'],base,k,'U+20,'+r[k]['sub'])
    css,n=pat.subn(lambda m:new,css);assert n==1,(fam,w)
open(P+'all.app.min.css','w').write('/* نسخهٔ اپ اصلی: فونت کامل + زیرمجموعهٔ آیکن‌های پرکاربرد با unicode-range */\n'+css if not css.startswith('/*') else css.replace('/*','/* نسخهٔ اپ اصلی (زیرمجموعه فونت با unicode-range) — ',1))
