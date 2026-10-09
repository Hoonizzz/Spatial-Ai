"""Serve the repository at port 8000; override SPATIAL_TEST_URL if needed."""
import os
import re
from playwright.sync_api import sync_playwright

BASE_URL=os.environ.get('SPATIAL_TEST_URL','http://127.0.0.1:8000')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox','--enable-unsafe-swiftshader'])
    page=browser.new_page(viewport={'width':1440,'height':1000})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda msg:errors.append(msg.text) if msg.type=='error' else None)
    page.goto(BASE_URL+'/?test=1')
    page.wait_for_selector('html[data-ready=true]',state='attached')
    assert page.locator('html').get_attribute('lang')=='en'
    assert not re.search(r'[\uac00-\ud7af]',page.locator('body').inner_text())
    assert page.locator('#building-count').inner_text()=='696'
    assert page.locator('#destination option').count()==697
    state=page.evaluate('spatialTest.state()')
    assert page.locator('#position-y').inner_text()=='0.0'
    assert abs(float(page.locator('#position-x').inner_text())-state['tourist']['point']['x'])<.051
    assert '40.723450' in page.locator('#local-origin').inner_text()
    assert state['tourist']['point']['x']!=0 or state['tourist']['point']['z']!=0
    assert re.match(r'40\.\d+° N · (?:73|74)\.\d+° W',page.locator('#geo-position').inner_text())
    print('Loaded 696 3D buildings, one street tourist, English controls and live coordinates.',flush=True)

    # Select a nearby destination with real scene hit-testing, not the test interface.
    candidates=page.evaluate('''() => {
      const t=spatialTest.state().tourist.point;
      return spatialTest.buildings().filter(b=>b.entrance).map(b=>({...b,
        screen:spatialTest.screen(b.center.x,b.center.z,b.height),
        d:Math.hypot(b.center.x-t.x,b.center.z-t.z)
      })).sort((a,b)=>a.d-b.d);
    }''')
    clicked=None
    for b in candidates:
        s=b['screen']
        if 320<s['x']<1060 and 100<s['y']<890:
            page.mouse.click(s['x'],s['y'])
            state=page.evaluate('spatialTest.state()')
            if state['selected'] and state['route']:
                clicked=state['selected'];break
    assert clicked,'A visible building should be selectable in the 3D view'
    state=page.evaluate('spatialTest.state()')
    assert state['route']['points'][0]==state['tourist']['point']
    assert state['route']['distance']>0
    assert page.locator('#directions li').count()>1
    assert page.locator('#walk').is_enabled()
    print('Real 3D building click produced measured route and directions.',flush=True)

    # A drag rotates the view without changing the selected destination.
    page.mouse.move(690,680);page.mouse.down();page.mouse.move(750,680,steps=5);page.mouse.up()
    assert page.evaluate('spatialTest.state().selected')==clicked
    page.locator('#reset-view').click()

    # Actual animation changes coordinates, then Pause freezes the tourist.
    # Use a long walk so the randomized nearby-click case cannot arrive before
    # Playwright has a chance to press Pause.
    far=next(b for b in reversed(candidates) if b['id']!=clicked)
    page.locator('#destination').select_option(far['id'])
    assert page.evaluate('spatialTest.state().route.distance')>100
    original=page.evaluate('spatialTest.state().tourist.point')
    page.locator('#walk').click()
    page.wait_for_function('(q)=>Math.hypot(spatialTest.state().tourist.point.x-q.x,spatialTest.state().tourist.point.z-q.z)>.2',arg=original)
    page.locator('#pause').click()
    paused=page.evaluate('spatialTest.state().tourist.point');page.wait_for_timeout(250)
    assert page.evaluate('spatialTest.state().tourist.point')==paused
    current=page.evaluate('spatialTest.state().tourist.point')
    target=next(b for b in candidates if b['id']not in [clicked,far['id']])
    page.locator('#destination').select_option(target['id'])
    assert page.evaluate('spatialTest.state().route.points[0]')==current
    assert page.evaluate('spatialTest.state().selected')==target['id']
    print('Walking, pause and replanning use the current tourist position.',flush=True)

    # Complete the exact production playback logic deterministically.
    page.locator('#walk').click();page.evaluate('spatialTest.advanceWalk(1000)')
    end=page.evaluate('spatialTest.state()')
    assert not end['walking']
    assert end['tourist']['point']==end['route']['points'][-1]
    assert 'Arrived' in page.locator('#tourist-state').inner_text()
    assert page.locator('#walk-progress').evaluate('(e)=>e.style.width')=='100%'

    # Regenerate one tourist and automatically recalculate the existing destination.
    old=end['tourist']['point'];page.locator('#respawn').click()
    new=page.evaluate('spatialTest.state()')
    assert new['tourist']['point']!=old
    assert new['route']['points'][0]==new['tourist']['point']
    assert new['selected']==target['id']
    unsupported=next(b for b in page.evaluate('spatialTest.buildings()') if not b['entrance'])
    page.locator('#destination').select_option(unsupported['id'])
    assert page.evaluate('spatialTest.state().route') is None
    assert page.locator('#walk').is_disabled()
    assert 'no connected modeled entrance' in page.locator('#status').inner_text()
    page.locator('#destination').select_option(target['id'])
    page.screenshot(path='/tmp/soho-desktop.png')

    # Mobile panel scrolls to the same controls; no horizontal overflow.
    page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(200)
    assert page.evaluate('document.documentElement.scrollWidth')==390
    page.locator('#destination').scroll_into_view_if_needed()
    assert page.locator('#destination').is_visible()
    page.locator('#destination').select_option(clicked)
    assert page.evaluate('spatialTest.state().selected')==clicked
    page.locator('#walk').scroll_into_view_if_needed()
    assert page.locator('#walk').is_enabled()
    page.screenshot(path='/tmp/soho-mobile.png')
    assert not errors,errors
    print('Browser smoke passed: 3D click, coordinates, English, route, drag, walk, pause, replan, arrival, respawn, inaccessible entrance, mobile, no browser errors.',flush=True)
    browser.close()
