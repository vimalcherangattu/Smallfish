import os,re,json,sys
from playwright.sync_api import sync_playwright
HERE=os.path.dirname(os.path.abspath(__file__)); PROJ=os.path.join(HERE,'..','project')
lay=json.load(open(os.path.join(HERE,'_layout.json')))
os.makedirs(os.path.join(HERE,'prev'),exist_ok=True)
only=sys.argv[1:] or list(lay['order'])
with sync_playwright() as pw:
    b=pw.chromium.launch()
    for fname in only:
        meta=lay['boards'][fname]
        src=open(os.path.join(PROJ,fname)).read()
        src=src.replace('<script src="./support.js"></script>','')
        src=re.sub(r'<script type="text/x-dc".*?</script>','',src,flags=re.S)
        src=src.replace('<x-dc>','').replace('</x-dc>','').replace('<helmet>','').replace('</helmet>','')
        tmp=os.path.join(HERE,'prev','_t.html'); open(tmp,'w').write(src)
        p=b.new_page(viewport={'width':meta['w'],'height':min(meta['h'],2000)},device_scale_factor=1)
        p.goto('file://'+tmp); p.wait_for_timeout(700)
        p.screenshot(path=os.path.join(HERE,'prev',fname.replace('.dc.html','.png')),full_page=True)
        p.close()
    b.close()
print('ok')
