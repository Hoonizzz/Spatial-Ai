from playwright.sync_api import sync_playwright
import struct,zlib
# Controlled DEM gradient fixture, not a claim about live terrain accuracy.
def chunk(t,d):return struct.pack('!I',len(d))+t+d+struct.pack('!I',zlib.crc32(t+d)&0xffffffff)
rows=b''.join(b'\0'+b''.join(bytes([128,20+x//4,0,255]) for x in range(256)) for y in range(256))
png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!IIBBBBB',256,256,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(rows))+chunk(b'IEND',b'')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=b.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.route('https://**/*',lambda r:r.abort())
 page.goto('http://127.0.0.1:8000/central-park/dist/')
 page.locator('#example').click();page.wait_for_function("document.querySelector('#kcal').textContent !== '—'")
 assert page.locator('html').get_attribute('lang')=='en'
 import re
 assert not re.search('[가-힣]',page.locator('body').inner_text())
 assert 'slope is not evaluated' in page.locator('#warnings').inner_text()
 assert page.locator('[data-agent=human]').count()==1
 assert page.locator('[data-agent=horse]').count()==1
 positions=lambda:page.locator('#mapTraveler').evaluate("e=>Array.from(e.children).map(n=>[n.dataset.agent,n.dataset.x,n.dataset.y])")
 initial=positions()
 page.locator('#play').click();page.wait_for_timeout(500)
 assert positions()!=initial
 assert page.locator('#mapTraveler .is-moving').count()==2
 page.locator('#play').click()
 paused=positions();page.wait_for_timeout(200);assert positions()==paused
 assert page.locator('#mapTraveler .is-moving').count()==0
 page.locator('#reset').click();assert positions()==initial
 page.locator('#scrubber').evaluate("e=>{e.value=500;e.dispatchEvent(new Event('input'))}")
 moved=positions();assert moved!=initial and moved[0][1:]!=moved[1][1:]
 assert page.locator('[data-agent=human] circle').count()>0
 assert page.locator('[data-agent=horse] rect').count()==1
 assert page.locator('[data-agent=human] text').text_content()=='HUMAN'
 assert page.locator('[data-agent=horse] text').text_content()=='HORSE'
 page.locator('.map-panel').screenshot(path='/tmp/central-park-agents-independent.png')
 page.locator('#scrubber').evaluate("e=>{e.value=750;e.dispatchEvent(new Event('input'))}")
 assert page.locator('#agentStatus').inner_text().count('Arrived')==1
 atArrival=positions()[0]
 page.locator('#scrubber').evaluate("e=>{e.value=850;e.dispatchEvent(new Event('input'))}")
 assert positions()[0]==atArrival
 humanKcal=page.locator('#kcal').inner_text()
 page.locator('#agentFocus').check()
 assert page.locator('#usd').inner_text()=='N/A'
 assert page.locator('#kcal').inner_text()!=humanKcal
 assert page.locator('[data-metric=usd]').is_disabled()
 assert 'not calibrated' in page.locator('#kcalRange').inner_text()
 assert page.locator('[data-route-agent=horse]').count()>0
 page.locator('#agentFocus').uncheck()
 page.locator('#reset').click()
 page.locator('#aboutButton').click();assert '1:18' in page.locator('#about').inner_text();page.locator('#closeAbout').click()
 page.route('https://s3.amazonaws.com/**',lambda r:r.fulfill(status=200,content_type='image/png',body=png,headers={'Access-Control-Allow-Origin':'*'}))
 result=page.evaluate('''async()=>{const {loadTerrain}=await import('./terrain.js');const raw={elements:[{type:'node',id:1,lon:-73.97,lat:40.78},{type:'node',id:2,lon:-73.968,lat:40.78},{type:'way',id:10,nodes:[1,2],tags:{highway:'cycleway'}}]};const d=await loadTerrain(raw);return {nodes:d.elements.filter(n=>n.type==='node').map(n=>n.tags?.ele),original:raw.elements.length,terrain:d.terrain};}''')
 assert len(result['nodes'])>2 and all(isinstance(n,(int,float)) for n in result['nodes']);assert result['original']==3
 snapshot=page.evaluate('''async()=>{const {exampleData}=await import('./example.js');const {unproject}=await import('./engine.js');const d=exampleData();for(const n of d.raw.elements)if(n.type==='node')n.tags={...n.tags,ele:20+(n.lat-40.78)*100};return JSON.stringify({...d,schema:'cp-snapshot-1',a:unproject(d.a),b:unproject(d.b),manifest:{mode:'controlled-test-fixture'}});}''')
 page.locator('#import').set_input_files({'name':'terrain-test.json','mimeType':'application/json','buffer':snapshot.encode()})
 page.wait_for_function("document.querySelector('#warnings').textContent.includes('Terrain ascent:')")
 assert page.locator('#elevationProfile').count()==0
 assert page.locator('.timeline').count()==1
 assert page.locator('#chart #elevationOverlay').count()==1
 assert page.locator('#chart #cumulativeOverlay').count()==1
 # Both series use the same elapsed-time extent, not time versus distance.
 extents=page.evaluate("['cumulativeOverlay','elevationOverlay'].map(id=>{const p=document.getElementById(id);return [p.getPointAtLength(0).x,p.getPointAtLength(p.getTotalLength()).x]})")
 for start,end in extents:
  assert abs(start-55)<.01 and abs(end-945)<.01,extents
 page.locator('#scrubber').evaluate("e=>{e.value=500;e.dispatchEvent(new Event('input'))}")
 assert abs(float(page.locator('#playhead').get_attribute('x1'))-500)<.01
 original=page.locator('#elevationOverlay').get_attribute('d')
 page.locator('[data-metric=usd]').click()
 assert page.locator('#elevationOverlay').get_attribute('d')==original
 assert 'Fare (USD)' in page.locator('#chart').text_content()
 page.locator('[data-metric=kcal]').click()
 page.locator('.timeline').screenshot(path='/tmp/central-park-overlap.png')
 # Horse-specific results and export must work independently of Citi Bike stations.
 page.locator('#agentFocus').check()
 page.locator('#scrubber').evaluate("e=>{e.value=1000;e.dispatchEvent(new Event('input'))}")
 assert 'Horse:' in page.locator('#agentStatus').inner_text() and page.locator('#agentStatus').inner_text().count('Arrived')==2
 assert page.locator('#currentCost').inner_text()=='Cumulative '+page.locator('#kcal').inner_text()+' kcal'
 with page.expect_download() as download:
  page.locator('#export').click()
 import zipfile,json
 with zipfile.ZipFile(download.value.path()) as z:
  output=json.loads(z.read('result.json'));assert output['selected_agent']=='horse'
  assert output['result']['horse']['fare'] is None and output['result']['horse']['model']['calibrated'] is False
  csv=z.read('cumulative.csv').decode();assert csv.splitlines()[-1].endswith(',')
  assert json.loads(z.read('snapshot.json'))['settings']['horse']['mass']==500
 page.locator('#horseSettings').evaluate("e=>e.open=true")
 page.locator('#horseSpeed').fill('3');page.locator('#horseSpeed').press('Tab')
 page.wait_for_function("document.querySelector('#warnings').textContent.includes('Terrain ascent:')")
 page.locator('#agentFocus').check()
 assert 'base speed 3 km/h' in page.locator('#stationDetail').inner_text()
 import json
 # Horse tags no longer select a separate route; both geometries must match.
 noHorse=json.loads(snapshot)
 for e in noHorse['raw']['elements']:
  if e['type']=='way':e['tags']['horse']='no'
 page.locator('#import').set_input_files({'name':'shared-human.json','mimeType':'application/json','buffer':json.dumps(noHorse).encode()})
 page.wait_for_function("document.querySelector('#warnings').textContent.includes('Terrain ascent:')")
 assert page.locator('[data-agent=human]').count()==1 and page.locator('[data-agent=horse]').count()==1
 humanPaths=page.locator('[data-route-agent=human]').evaluate_all("es=>es.map(e=>e.getAttribute('d'))")
 horsePaths=page.locator('[data-route-agent=horse]').evaluate_all("es=>es.map(e=>e.getAttribute('d'))")
 assert humanPaths==horsePaths
 assert page.locator('#agentAvailability').is_hidden()
 assert page.locator('#agentFocus').is_checked()
 assert 'shared human route' in page.locator('#stationDetail').inner_text()
 assert page.locator('#usd').inner_text()=='N/A'
 # Missing shared routes remain honestly unavailable and the toggle still works.
 missing=json.loads(snapshot);missing['stations']=[]
 page.locator('#import').set_input_files({'name':'missing-shared-route.json','mimeType':'application/json','buffer':json.dumps(missing).encode()})
 page.wait_for_function("document.querySelector('#agentAvailability').textContent.includes('shared human route is unavailable')")
 assert page.locator('#kcal').inner_text()=='—'
 assert page.locator('[data-agent]').count()==0
 page.locator('#agentFocus').uncheck();assert 'Human route unavailable' in page.locator('#agentAvailability').inner_text()
 page.locator('#agentFocus').check();assert 'Horse route unavailable' in page.locator('#agentAvailability').inner_text()
 assert page.locator('#export').is_disabled()
 # Return to a shared route and check the switch preserves elapsed time.
 page.locator('#import').set_input_files({'name':'shared-route.json','mimeType':'application/json','buffer':snapshot.encode()})
 page.wait_for_function("document.querySelector('#warnings').textContent.includes('Terrain ascent:')")
 page.locator('#scrubber').evaluate("e=>{e.value=300;e.dispatchEvent(new Event('input'))}")
 elapsed=page.locator('#clock').inner_text()
 page.locator('#agentFocus').uncheck();assert page.locator('#clock').inner_text()==elapsed
 page.locator('#agentFocus').check();assert page.locator('#clock').inner_text()==elapsed
 page.locator('.map-panel').screenshot(path='/tmp/shared-route-agents.png')
 assert not re.search('[가-힣]',page.locator('body').inner_text())
 page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert not errors,errors
 print('PASS: human/horse icons, shared route geometry, separate speeds and unchanged metabolism, pause, reset, scrub, focus switch, route sharing despite horse tags and unavailable shared routes; English UI, example routing, missing-terrain disclosure, playback, model explanation, mobile, overlaid time-aligned terrain/energy, shared scrubber, fare toggle; PNG terrain decoding, 30 m densification, nonmutating enrichment with controlled DEM fixture')
 b.close()
