"""Run from repository root with python3 -m http.server 8000 running."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = os.environ.get('MAZE_TEST_URL', 'http://127.0.0.1:8000/')
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), args=['--no-sandbox', '--disable-webgl', '--disable-gpu'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(URL + '?test=1')
    page.wait_for_function('window.mazeTest && mazeTest.scene && mazeTest.scene.canvas.width > 0 && mazeTest.scene.scale > 1')
    assert page.title() == 'Perception in a Maze · 2D Spatial Lab'
    assert page.locator('#scene canvas').count() == 1
    assert page.evaluate('mazeTest.sim.agents.every(a=>a.memory.cells.size===0)')
    # Validate a real rendered material pixel, not just an existing canvas.
    sample = page.evaluate('''()=>{const v=mazeTest.scene,w=mazeTest.sim.world.walls.find(w=>w.material==='concrete');const x=(v.origin.x+(w.x+1)*v.scale)*v.canvas.width/v.width;const z=(v.origin.z+(w.z+1)*v.scale)*v.canvas.height/v.height;return [...v.ctx.getImageData(x,z,1,1).data];}''')
    assert sample == [242, 219, 181, 255], sample
    page.locator('#start').click()
    page.wait_for_function('mazeTest.sim.time>.3')
    page.locator('#start').click()
    time = page.evaluate('mazeTest.sim.time')
    page.wait_for_timeout(250)
    assert page.evaluate('mazeTest.sim.time') == time
    assert page.evaluate('mazeTest.sim.agents.every(a=>a.memory.cells.size>0&&a.distance>0&&a.p.y===.5)')
    page.locator('#reset').click();page.evaluate('mazeTest.step(100)')
    first = page.evaluate('JSON.stringify(mazeTest.sim.export())')
    page.locator('#reset').click();page.evaluate('mazeTest.step(100)')
    assert page.evaluate('JSON.stringify(mazeTest.sim.export())') == first
    geometry = page.evaluate('JSON.stringify(mazeTest.sim.world.walls.map(w=>[w.x,w.z]))')
    for environment in ['A', 'B', 'C']:
        page.locator('#environment').select_option(environment)
        assert page.evaluate('mazeTest.sim.time') == 0
        assert page.evaluate('mazeTest.sim.agents.every(a=>a.memory.cells.size===0)')
        assert page.evaluate('JSON.stringify(mazeTest.sim.world.walls.map(w=>[w.x,w.z]))') == geometry
    for sensor in ['lidarRange', 'echoRange']:
        page.locator('#'+sensor).fill('3');page.locator('#'+sensor).dispatch_event('change')
    page.evaluate('mazeTest.step(100)')
    assert page.evaluate('mazeTest.sim.agents.every(a=>a.rays.every(r=>r.b.y===.5&&Math.hypot(r.a.x-r.b.x,r.a.z-r.b.z)<=3.001))')
    snapshot = page.evaluate('JSON.stringify(mazeTest.sim.export())')
    scale = page.evaluate('mazeTest.scene.scale')
    for mode in ['human', 'bat', 'overlap', 'world']:
        page.locator('[data-knowledge="'+mode+'"]').click()
        page.wait_for_function('(mode)=>mazeTest.scene.knowledgeMode===mode', arg=mode)
        assert page.locator('[data-knowledge="'+mode+'"]').get_attribute('aria-pressed') == 'true'
        assert page.evaluate('JSON.stringify(mazeTest.sim.export())') == snapshot
        assert page.evaluate('mazeTest.scene.scale') == scale
        if mode == 'human':assert page.evaluate('mazeTest.scene.visibleAgent(0)&&!mazeTest.scene.visibleAgent(1)')
        if mode == 'bat':assert page.evaluate('mazeTest.scene.visibleAgent(1)&&!mazeTest.scene.visibleAgent(0)')
    page.locator('#map-memory').check()
    page.wait_for_function('mazeTest.scene.showMemory')
    assert 'ACCUMULATED' in page.locator('.view-caption').inner_text()
    assert page.evaluate('JSON.stringify(mazeTest.sim.export())') == snapshot
    assert page.locator('#memory-Human').count() == 1
    assert page.locator('#memory-Bat').count() == 1
    for mode in ['follow-human','follow-bat','follow-mouse','fit']:
        page.locator('#camera').select_option(mode)
        assert page.evaluate('mazeTest.scene.cameraMode') == mode
    page.locator('#zoom-in').click();assert page.evaluate('mazeTest.scene.zoom') > 1
    page.locator('#zoom-out').click();assert page.evaluate('mazeTest.scene.zoom') == 1
    for layer in ['geometry','maps','rays','pulses','sound','range','trails','landmarks']:
        page.locator('#layer-'+layer).set_checked(False)
        page.locator('#layer-'+layer).set_checked(True)
    page.wait_for_function('mazeTest.scene.drawnRegions>0')
    assert page.locator('#ui-size').input_value() == '1.5'
    page.evaluate('''()=>{const s=mazeTest.sim;s.mouse.p={x:5,y:.5,z:11};s.mouse.moving=false;s.mouse.nextDecision=100;s.agents[0].p={x:5,y:.5,z:11};s.agents[1].p={x:3,y:.5,z:11};mazeTest.step(1);}''')
    assert 'Human captures' in page.locator('#result').inner_text()
    with page.expect_download() as download:
        page.locator('#export').click()
    target = Path('/tmp/maze-plan-export.json');download.value.save_as(target)
    exported = json.loads(target.read_text());assert exported['winner']=='Human'
    assert exported['agents'][0]['metrics']['captureTime']>0
    page.locator('#reset').click();page.locator('#regenerate').click()
    assert page.locator('#seed').input_value() != '2026'
    for width,height in [(1920,1080),(1440,1000),(1000,900),(390,844)]:
        page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(150)
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
    page.screenshot(path='/tmp/maze-plan-mobile.png',full_page=True)
    page.set_viewport_size({'width':1440,'height':1000})
    page.locator('#seed').fill('2026');page.locator('#seed').dispatch_event('change')
    for sensor,value in [('lidarRange','12'),('echoRange','8')]:
        page.locator('#'+sensor).fill(value);page.locator('#'+sensor).dispatch_event('change')
    page.evaluate('mazeTest.step(300)')
    page.evaluate('scrollTo(0,0)')
    page.screenshot(path='/tmp/maze-plan-desktop.png',full_page=True)
    page.goto(URL)
    assert page.evaluate('typeof window.mazeTest') == 'undefined'
    assert not errors,errors
    browser.close()
    print('PASS: real Canvas 2D drawing, planar movement, pause/reset/replay, material experiments, finite sensing, isolated knowledge views, metric scale, zoom/follow, layers, capture/export, mobile, no browser errors')
