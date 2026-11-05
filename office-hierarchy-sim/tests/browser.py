"""Serve the repository on :8000 before running; exercises the production build."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = os.environ.get('OFFICE_TEST_URL', 'http://127.0.0.1:8000/office-hierarchy-sim/dist/')

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), args=['--no-sandbox','--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL + '?test=1')
    page.wait_for_function('window.officeTest && officeTest.sim.time > .2')
    page.locator('#run').click()
    t = page.evaluate('officeTest.sim.time')
    page.wait_for_timeout(200)
    assert page.evaluate('officeTest.sim.time') == t
    assert page.locator('#agentSelect option').count() == 22
    page.wait_for_function('officeTest.mode === "3d" && officeTest.scene.actors.size === 22 && officeTest.scene.visibleFovCount === 22')
    assert page.locator('#allFov').is_checked()
    old_seed = page.evaluate('officeTest.sim.config.seed')
    old_layout = page.evaluate('officeTest.sim.agents.map(a=>[a.x,a.y,a.heading])')
    page.locator('#reset').click()
    assert page.evaluate('officeTest.sim.config.seed') != old_seed
    assert page.evaluate('officeTest.sim.agents.map(a=>[a.x,a.y,a.heading])') != old_layout
    assert int(page.locator('#seed').input_value()) == page.evaluate('officeTest.sim.config.seed')
    initial = page.evaluate('officeTest.sim.agents.map(a=>[a.x,a.y,a.heading])')
    page.evaluate('officeTest.step(200)')
    result = page.evaluate('JSON.stringify(officeTest.sim.exportData())')
    assert page.evaluate('officeTest.sim.agents.every(a=>a.distance>0)')
    assert page.evaluate('officeTest.sim.wc.occupants.size + officeTest.sim.wc.reservations.size <= 4')
    page.locator('#replaySeed').click()
    assert page.evaluate('officeTest.sim.agents.map(a=>[a.x,a.y,a.heading])') == initial
    page.evaluate('officeTest.step(200)')
    assert page.evaluate('JSON.stringify(officeTest.sim.exportData())') == result
    page.locator('#agentSelect').select_option('JUNIOR-12')
    assert page.evaluate('officeTest.view.selected') == 'JUNIOR-12'
    assert 'Junior' in page.locator('#inspector').inner_text()
    page.locator('#allFov').uncheck()
    page.wait_for_function('officeTest.scene.visibleFovCount === 1')
    point = page.evaluate('officeTest.project("LEAD-3")')
    page.mouse.click(point['x'],point['y'])
    assert page.evaluate('officeTest.view.selected') == 'LEAD-3'
    before_camera = page.evaluate('officeTest.scene.camera.position.toArray()')
    box = page.locator('#office').bounding_box()
    page.mouse.move(box['x']+box['width']*.5,box['y']+box['height']*.5)
    page.mouse.down();page.mouse.move(box['x']+box['width']*.5+80,box['y']+box['height']*.5,steps=6);page.mouse.up()
    page.wait_for_timeout(300)
    assert page.evaluate('officeTest.scene.camera.position.toArray()') != before_camera
    page.locator('#cameraHome').click()
    page.locator('#viewMode').select_option('2d')
    assert page.locator('#plan').is_visible() and page.locator('#office').is_hidden()
    page.locator('#viewMode').select_option('3d')
    assert page.locator('#office').is_visible()
    for control in ['allFov', 'heat', 'blockers']:
        page.locator('#' + control).check()
    page.locator('#paths').uncheck()
    assert page.evaluate('officeTest.view.heat && officeTest.view.allFov && !officeTest.view.paths')
    page.locator('#fov').fill('120')
    page.locator('#radius-JUNIOR').fill('10')
    page.locator('#seed').fill('51')
    page.locator('#apply').click()
    assert page.evaluate('officeTest.sim.config.seed===51 && officeTest.sim.agents.every(a=>a.fovDeg===120)')
    assert page.evaluate('officeTest.sim.agents.filter(a=>a.role==="JUNIOR").every(a=>a.visionRangeM===10)')
    page.locator('#scenario').select_option('3')
    assert page.evaluate('officeTest.sim.wc.capacity') == 0
    baseline = page.evaluate('officeTest.sim.agents.map(a=>[a.x,a.y,a.heading])')
    page.locator('#scenario').select_option('1')
    assert page.evaluate('officeTest.sim.agents.map(a=>[a.x,a.y,a.heading])') == baseline
    assert page.evaluate('officeTest.sim.agents.every(a=>a.visionRangeM===6)')
    page.locator('#scenario').select_option('4')
    assert page.evaluate('officeTest.sim.config.openVisibility && officeTest.sim.wc.capacity===4')
    page.locator('#seed').fill('-1')
    page.locator('#apply').click()
    assert page.locator('#settingsStatus.error').count() == 1
    page.locator('#seed').fill('42')
    page.locator('#scenario').select_option('0')
    page.evaluate('officeTest.step(100)')
    with page.expect_download() as dl:
        page.locator('#json').click()
    data = json.loads(Path(dl.value.path()).read_text())
    assert abs(data['world']['area']-616)<1e-7
    assert data['config']['wcEscapeProbability']==.25
    assert len(data['agents']) == 22 and len(data['heat']) == data['world']['heatCols']*data['world']['heatRows']
    with page.expect_download() as dl:
        page.locator('#csv').click()
    assert len(Path(dl.value.path()).read_text().splitlines()) == 5
    page.locator('#viewMode').select_option('2d')
    page.locator('#batchSeconds').fill('10')
    page.locator('#compare').click()
    page.wait_for_function('document.querySelector("#batchStatus").textContent.includes("Completed")', timeout=30000)
    page.locator('#cancelBatch').click()
    assert page.locator('#batchStatus').inner_text() == 'Comparison cancelled.'
    assert page.locator('#compare').is_enabled()
    # Exercise a complete 20-seed × 5-scenario experiment through the real worker.
    page.locator('#compare').click()
    page.wait_for_function('!document.querySelector("#batchExport").disabled', timeout=240000)
    assert page.locator('#batchResults tr').count() == 5
    with page.expect_download() as dl:
        page.locator('#batchExport').click()
    assert len(Path(dl.value.path()).read_text().splitlines()) == 101
    page.locator('#run').click()
    page.wait_for_function('officeTest.running && officeTest.sim.time>5.2')
    page.locator('#run').click()
    page.set_viewport_size({'width': 390, 'height': 844})
    page.wait_for_timeout(100)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Mobile overflow'
    page.locator('#viewMode').select_option('3d')
    assert page.locator('#office').bounding_box()['width'] < 390
    page.screenshot(path='/tmp/office-mobile.png', full_page=True)
    assert not errors, errors
    page.goto(URL)
    assert page.evaluate('typeof window.officeTest') == 'undefined'
    browser.close()
    print('PASS: 22 voxel people, all FOV, 616 m², random reset + seeded replay, 3D selection/orbit, 2D switch, controls, room-refuge settings, exports, 100 worker runs, mobile, no runtime errors')
