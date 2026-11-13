import json,subprocess,sys,os
ROOT=os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..'))+'/'
from fontTools.ttLib import TTFont
SP=sys.argv[1];W=ROOT+'public/vendor/fa/webfonts/'
d=json.load(open(SP+'/styles.json'));found=d['found'];st=d['st']
cm={k:set(TTFont(W+f'fa-{k}.ttf').getBestCmap()) for k in ['solid-900','regular-400','brands-400']}
sel={'solid-900':set(),'regular-400':set(),'brands-400':set()}
miss=[]
for n,styles in st.items():
    cp=int(found[n],16)
    for s in styles:
        k={'s':'solid-900','r':'regular-400','b':'brands-400'}[s]
        if cp in cm[k]: sel[k].add(cp)
        else: miss.append((n,s))
print('not in font for style (harmless, no glyph):',miss)
def ranges(cps):
    cps=sorted(cps);out=[];a=b=None
    for c in cps:
        if a is None:a=b=c
        elif c==b+1:b=c
        else:out.append((a,b));a=b=c
    if a is not None:out.append((a,b))
    return ','.join('U+%X'%a if a==b else 'U+%X-%X'%(a,b) for a,b in out)
res={}
for k,cps in sel.items():
    out=W+f'fa-{k}.subset.woff2'
    subprocess.check_call(['pyftsubset',W+f'fa-{k}.ttf','--unicodes='+','.join('%X'%c for c in sorted(cps)),'--flavor=woff2','--output-file='+out])
    res[k]={'n':len(cps),'sub':ranges(cps),'full':ranges(cm[k])}
json.dump(res,open(SP+'/ranges.json','w'),indent=1)
for k,v in res.items():print(k,v['n'])
