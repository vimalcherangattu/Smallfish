import os, re, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import doors, signup, search, results, extras, app2

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'project')

ROWS = [
    ('Marketing · the six doors in', doors.SCREENS),
    ('Sign-up to first list', signup.SCREENS),
    ('Four ways to search', search.SCREENS),
    ('Results, lists and contacted', results.SCREENS),
    ('Everything else, and when things go sideways', extras.SCREENS),
    ('App v2 \u2014 built to the engineering brief', app2.SCREENS),
]

Y0 = 21400
GAPX = 120
GAPY = 520
TAGS = ['div','span','section','button','a','p','svg','g','header','footer','nav',
        'h1','h2','h3','h4','label','ul','li','sc-for','sc-if','form','text','rect']

def main():
    boards, notes, order = {}, {}, []
    y = Y0
    ni = 100
    for ri, (rowtitle, fns) in enumerate(ROWS):
        made = [fn() for fn in fns]
        notes[f'u{ri}'] = {'kind': 'title1', 'maxW': 9000, 'text': rowtitle, 'w': 240, 'x': 0, 'y': y - 300}
        x = 0
        maxh = 0
        for fname, title, w, h, html in made:
            path = os.path.join(OUT, fname)
            with open(path, 'w') as f:
                f.write(html)
            for t in TAGS:
                o = len(re.findall(r'<%s[\s>]' % t, html)); c = html.count('</%s>' % t)
                if o != c:
                    print('  ! unbalanced', fname, t, o, c)
            if re.search(r'<[a-z]+[^>]*\bclass="[^"]*"[^>]*\bclass=', html):
                print('  ! duplicate class attribute in', fname)
            boards[fname] = {'h': h, 'title': title, 'w': w, 'x': x, 'y': y}
            order.append(fname)
            x += w + GAPX
            maxh = max(maxh, h)
            print(f'{fname:28} {w}x{h}  {title}')
        y += maxh + GAPY
    json.dump({'boards': boards, 'notes': notes, 'order': order},
              open(os.path.join(OUT, '..', 'screens', '_layout.json'), 'w'), indent=1)
    print('\n%d boards, bottom at y=%d' % (len(boards), y))

if __name__ == '__main__':
    main()
