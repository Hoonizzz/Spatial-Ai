"""Run from repository root with python3 -m http.server 8000 running."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = os.environ.get('MAZE_TEST_URL', 'http://127.0.0.1:8000/')
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), args=['--no-sandbox', '--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(URL + '?test=1')
    page.wait_for_function('window.mazeTest && mazeTest.scene && mazeTest.scene.renderer.info.render.frame > 0')
    assert page.title() == 'Perception in a Maze · Spatial Lab'
    assert page.evaluate('mazeTest.sim.agents.every(a => a.memory.cells.size === 0)')
    page.locator('#start').click()
    page.wait_for_function('mazeTest.sim.time > .3')
    page.locator('#start').click()
    time = page.evaluate('mazeTest.sim.time')
    page.wait_for_timeout(300)
    assert page.evaluate('mazeTest.sim.time') == time
    assert page.evaluate('mazeTest.sim.agents.every(a => a.memory.cells.size > 0 && a.distance > 0)')
    assert page.evaluate('mazeTest.sim.agents[0].memory !== mazeTest.sim.agents[1].memory')
    page.locator('#reset').click()
    page.evaluate('mazeTest.step(100)')
    first = page.evaluate('JSON.stringify(mazeTest.sim.export())')
    page.locator('#reset').click()
    page.evaluate('mazeTest.step(100)')
    assert page.evaluate('JSON.stringify(mazeTest.sim.export())') == first
    geometry = page.evaluate('JSON.stringify(mazeTest.sim.world.walls.map(w=>[w.x,w.z,w.height]))')
    mouse = page.evaluate('mazeTest.sim.mouse.p')
    for environment in ['A', 'B', 'C']:
        page.locator('#environment').select_option(environment)
        assert page.evaluate('mazeTest.sim.time') == 0
        assert page.evaluate('mazeTest.sim.agents.every(a => a.memory.cells.size === 0)')
        assert page.evaluate('JSON.stringify(mazeTest.sim.world.walls.map(w=>[w.x,w.z,w.height]))') == geometry
    page.locator('#lidarRange').fill('3')
    page.locator('#lidarRange').dispatch_event('change')
    page.locator('#echoRange').fill('3')
    page.locator('#echoRange').dispatch_event('change')
    page.evaluate('mazeTest.step(1)')
    assert page.evaluate('mazeTest.sim.agents.every(a=>a.rays.every(r=>Math.hypot(r.a.x-r.b.x,r.a.y-r.b.y,r.a.z-r.b.z)<=3.001))')
    for mode in ['top', 'follow-human', 'follow-bat', 'follow-mouse', 'orbit']:
        page.locator('#camera').select_option(mode)
        assert page.evaluate('mazeTest.scene.cameraMode') == mode
    # Physical transparency reflects material identity, never an x-ray shortcut.
    assert page.evaluate('mazeTest.scene.environment.children.filter(o=>o.userData.materialType).every(o=>o.userData.materialType === "glass" ? o.material.transparent && o.material.opacity < 1 : !o.material.transparent && o.material.opacity === 1)')
    snapshot = page.evaluate('JSON.stringify(mazeTest.sim.export())')
    for mode in ['human', 'bat', 'overlap', 'world']:
        page.locator('[data-knowledge="'+mode+'"]').click()
        page.wait_for_function('(mode)=>mazeTest.scene.knowledgeMode===mode && mazeTest.scene.environment.visible===(mode==="world")', arg=mode)
        assert page.locator('[data-knowledge="'+mode+'"]').get_attribute('aria-pressed') == 'true'
        assert page.evaluate('JSON.stringify(mazeTest.sim.export())') == snapshot
        if mode != 'world':
            assert page.evaluate('!mazeTest.scene.mouse.visible')
        if mode == 'human':
            assert page.evaluate('mazeTest.scene.human.visible && !mazeTest.scene.bat.visible')
        if mode == 'bat':
            assert page.evaluate('mazeTest.scene.bat.visible && !mazeTest.scene.human.visible')
    assert page.locator('#memory-Human').count() == 1
    assert page.locator('#memory-Bat').count() == 1
    physical_heights = page.evaluate('mazeTest.sim.world.walls.map(w=>w.height)')
    page.locator('#cutaway').uncheck()
    assert page.evaluate('mazeTest.sim.world.walls.map(w=>w.height)') == physical_heights
    page.locator('#cutaway').check()
    assert page.locator('#ui-size').input_value() == '3'
    for layer in ['geometry', 'maps', 'rays', 'pulses', 'sound', 'range', 'trails', 'landmarks']:
        page.locator('#layer-' + layer).set_checked(False)
        page.locator('#layer-' + layer).set_checked(True)
    page.wait_for_timeout(200)
    assert page.evaluate('mazeTest.scene.map.count > 0 && mazeTest.scene.map.visible')
    # A capture uses the actual simulation and stops the run.
    page.evaluate('''()=>{const s=mazeTest.sim;s.mouse.p={x:5,y:.35,z:11};s.mouse.moving=false;s.mouse.nextDecision=100;s.agents[0].p={x:5,y:.55,z:11};mazeTest.step(1);}''')
    assert 'Human captures' in page.locator('#result').inner_text()
    assert page.evaluate('!mazeTest.sim.running')
    with page.expect_download() as download_info:
        page.locator('#export').click()
    target = Path('/tmp/maze-browser-export.json')
    download_info.value.save_as(target)
    exported = json.loads(target.read_text())
    assert exported['winner'] == 'Human'
    assert exported['agents'][0]['metrics']['captureTime'] > 0
    assert exported['agents'][0]['map']
    page.locator('#reset').click()
    page.locator('#regenerate').click()
    assert page.locator('#seed').input_value() != '2026'
    page.locator('#seed').fill('2026')
    page.locator('#seed').dispatch_event('change')
    page.locator('#lidarRange').fill('12')
    page.locator('#lidarRange').dispatch_event('change')
    page.locator('#echoRange').fill('8')
    page.locator('#echoRange').dispatch_event('change')
    page.evaluate('mazeTest.step(200)')
    page.screenshot(path='/tmp/maze-desktop.png', full_page=True)
    page.set_viewport_size({'width': 390, 'height': 844})
    page.wait_for_timeout(300)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Mobile horizontal overflow'
    page.screenshot(path='/tmp/maze-mobile.png', full_page=True)
    page.goto(URL)
    assert page.evaluate('typeof window.mazeTest') == 'undefined'
    assert not errors, errors
    browser.close()
    print('PASS: production 3D rendering, start/pause/reset, reproducible seed, A/B/C fairness, finite sensing, cameras/layers, physical capture, JSON export, mobile, no browser errors')
