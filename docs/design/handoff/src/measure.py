import os,re,json
from playwright.sync_api import sync_playwright
HERE=os.path.dirname(os.path.abspath(__file__)); PROJ=os.path.join(HERE,'..','project')
lay=json.load(open(os.path.join(HERE,'_layout.json')))
with sync_playwright() as pw:
    b=pw.chromium.launch()
    for fname in lay['order']:
        meta=lay['boards'][fname]
        src=open(os.path.join(PROJ,fname)).read()
        src=src.replace('<script src="./support.js"></script>','')
        src=re.sub(r'<script type="text/x-dc".*?</script>','',src,flags=re.S)
        src=src.replace('<x-dc>','').replace('</x-dc>','').replace('<helmet>','').replace('</helmet>','')
        src=src.replace('</style>','.sf{height:auto!important;overflow:visible!important}.shell{height:auto!important}.site{height:auto!important}.main{min-height:0}</style>')
        tmp=os.path.join(HERE,'prev','_m.html'); open(tmp,'w').write(src)
        p=b.new_page(viewport={'width':meta['w'],'height':900})
        p.goto('file://'+tmp); p.wait_for_timeout(500)
        h=p.evaluate("()=>document.querySelector('.sf').getBoundingClientRect().height")
        print('%-28s set=%-6d content=%-6d  -> %d'%(fname,meta['h'],round(h),round(h)+40))
        p.close()
    b.close()
