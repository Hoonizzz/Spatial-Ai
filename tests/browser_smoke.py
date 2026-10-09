"""Run against python3 -m http.server 8000 at the repository root."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get('SPATIAL_TEST_URL', 'http://127.0.0.1:8000')
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), args=['--no-sandbox', '--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda msg: errors.append(msg.text) if msg.type == 'error' else None)
    page.goto(BASE_URL + '/?test=1')
    page.wait_for_selector('html[data-ready="true"]', state='attached')
    assert page.locator('.person-button').count() == 6
    initial = page.evaluate('spatialTest.state()')

    # Real mouse movement: all six actors independently reach a nearby valid destination.
    for person in initial:
        page.locator(f'.person-button[data-id="{person["id"]}"]').click()
        target = {'x': person['x'] + 8, 'z': person['z'] - 8}
        before = page.evaluate('spatialTest.state()')
        screen = page.evaluate('(q) => spatialTest.screen(q.x,q.z)', target)
        page.mouse.click(screen['x'], screen['y'])
        print(f'Checking {person["id"]} click to {target}: {page.locator("#status").inner_text()}', flush=True)
        try:
            page.wait_for_function('(q) => {const p=spatialTest.state().find(p=>p.id===q.id);return p.movement==="STOP" && Math.hypot(p.x-q.x,p.z-q.z)<0.3}', arg={**target, 'id': person['id']})
        except Exception:
            print(page.evaluate('spatialTest.state()'), flush=True)
            page.screenshot(path='/tmp/spatial-failure.png')
            raise
        after = page.evaluate('spatialTest.state()')
        for a,b in zip(before,after):
            if a['id'] != person['id']:
                assert a['x'] == b['x'] and a['z'] == b['z']

    # Scene geometry and identifier hit-testing.
    screen = page.evaluate('spatialTest.screen(28,-29,4)')
    page.mouse.click(screen['x'],screen['y'])
    assert page.locator('[data-id="C"]').get_attribute('aria-pressed') == 'true'

    # Invalid destination preserves existing route, then STOP clears it.
    page.locator('[data-id="A"]').click()
    assert page.evaluate('spatialTest.setDestination({x:0,z:80})')
    assert not page.evaluate('spatialTest.setDestination({x:110,z:0})')
    state = page.evaluate('spatialTest.state()[0]')
    assert state['route'][-1] == {'x':0,'z':80}
    assert not page.evaluate('spatialTest.setDestination({x:-43,z:-35})')
    page.locator('#stop').click()
    assert page.evaluate('spatialTest.state()[0].route.length') == 0

    # Camera drag must not trigger movement.
    before = page.evaluate('spatialTest.state()')
    page.mouse.move(690,600)
    page.mouse.down()
    page.mouse.move(750,620,steps=10)
    page.mouse.up()
    after = page.evaluate('spatialTest.state()')
    assert before == after
    page.locator('#reset').click()
    assert [(x['x'],x['z']) for x in page.evaluate('spatialTest.state()')] == [(x['x'],x['z']) for x in initial]

    page.screenshot(path='/tmp/spatial-desktop.png')
    page.set_viewport_size({'width':390,'height':844})
    page.wait_for_timeout(250)
    assert page.locator('#office').is_visible() and page.locator('#tourists').is_visible()
    assert page.evaluate('document.documentElement.scrollWidth') == 390
    page.screenshot(path='/tmp/spatial-mobile.png')
    assert not errors, errors
    browser.close()
    print('Browser smoke passed: six click-to-move checks, independence, scene selection, invalid targets, STOP, drag, reset, mobile, no console errors.')
