"""Serve the repository on port 8000, then run this real-worker playback regression."""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    page=browser.new_page()
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.add_init_script('''const NativeWorker=window.Worker;window.routeRequests=0;
    window.Worker=class extends NativeWorker{postMessage(message,...args){if(message.type==='route')window.routeRequests++;return super.postMessage(message,...args);}};''')
    page.route('https://**/*',lambda r:r.abort())
    page.goto('http://127.0.0.1:8000/central-park/dist/')
    page.locator('#example').click()
    page.wait_for_function("!document.querySelector('#play').disabled")
    # Native blur/change schedules an automatic calculation; clicking the manual
    # button must consume that timer instead of calculating again 300 ms later.
    page.locator('#settings').evaluate('e=>e.open=true')
    before=page.evaluate('routeRequests')
    page.locator('#speed').fill('16')
    page.locator('#calculate').click()
    page.wait_for_function("!document.querySelector('#calculate').disabled")
    page.wait_for_timeout(500)
    assert page.evaluate('routeRequests')==before+1, 'Manual calculation left the debounced automatic calculation queued'
    # Recalculating an active journey should restart the new route and resume.
    page.locator('#play').click()
    page.wait_for_function("document.querySelectorAll('#mapTraveler .is-moving').length===2")
    page.locator('#calculate').click()
    page.wait_for_function("!document.querySelector('#calculate').disabled")
    page.wait_for_function("document.querySelectorAll('#mapTraveler .is-moving').length===2")
    positions=lambda:page.locator('#mapTraveler').evaluate('e=>Array.from(e.children).map(n=>[n.dataset.x,n.dataset.y])')
    previous=positions();page.wait_for_timeout(300);assert positions()!=previous
    # Repeated recalculation also works with Horse selected, then when paused.
    page.locator('#agentFocus').check()
    page.locator('#calculate').click()
    page.wait_for_function("!document.querySelector('#calculate').disabled")
    page.wait_for_function("document.querySelectorAll('#mapTraveler .is-moving').length===2")
    page.locator('#play').click()
    page.locator('#calculate').click()
    page.wait_for_function("!document.querySelector('#calculate').disabled")
    assert page.locator('#mapTraveler .is-moving').count()==0
    page.locator('#play').click()
    previous=positions();page.wait_for_timeout(300);assert positions()!=previous
    page.locator('#scrubber').evaluate("e=>{e.value=1000;e.dispatchEvent(new Event('input'))}")
    page.locator('#calculate').click()
    page.wait_for_function("!document.querySelector('#calculate').disabled")
    page.locator('#play').click()
    previous=positions();page.wait_for_timeout(300);assert positions()!=previous
    # A debounced settings update during playback resumes the rebuilt sequences.
    before=page.evaluate('routeRequests')
    page.locator('#mass').fill('71');page.locator('#mass').press('Tab')
    page.wait_for_function('(n)=>window.routeRequests===n+1',arg=before)
    page.wait_for_function("!document.querySelector('#calculate').disabled")
    page.wait_for_function("document.querySelectorAll('#mapTraveler .is-moving').length===2")
    # Invalid input should not leave calculation or playback permanently disabled.
    page.locator('#horseSettings').evaluate('e=>e.open=true')
    page.locator('#horseSpeed').fill('0');page.locator('#horseSpeed').press('Tab')
    page.wait_for_function("!document.querySelector('#error').hidden")
    page.locator('#horseSpeed').fill('6');page.locator('#calculate').click()
    page.wait_for_function("!document.querySelector('#calculate').disabled && !document.querySelector('#play').disabled")
    page.locator('#play').click()
    previous=positions();page.wait_for_timeout(300);assert positions()!=previous
    assert page.locator('#horseSpeed').input_value()=='6'
    assert not errors,errors
    print('PASS: one request per manual recalculation, active replay resumes, paused/arrived replay restarts, Human/Horse toggle, unchanged horse speed')
    browser.close()
