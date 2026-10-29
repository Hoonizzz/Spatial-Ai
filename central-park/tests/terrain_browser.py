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
 page.locator('#play').click();page.wait_for_timeout(500)
 page.locator('#play').click()
 page.locator('#aboutButton').click();assert '1:18' in page.locator('#about').inner_text();page.locator('#closeAbout').click()
 page.route('https://s3.amazonaws.com/**',lambda r:r.fulfill(status=200,content_type='image/png',body=png,headers={'Access-Control-Allow-Origin':'*'}))
 result=page.evaluate('''async()=>{const {loadTerrain}=await import('./terrain.js');const raw={elements:[{type:'node',id:1,lon:-73.97,lat:40.78},{type:'node',id:2,lon:-73.968,lat:40.78},{type:'way',id:10,nodes:[1,2],tags:{highway:'cycleway'}}]};const d=await loadTerrain(raw);return {nodes:d.elements.filter(n=>n.type==='node').map(n=>n.tags?.ele),original:raw.elements.length,terrain:d.terrain};}''')
 assert len(result['nodes'])>2 and all(isinstance(n,(int,float)) for n in result['nodes']);assert result['original']==3
 snapshot=page.evaluate('''async()=>{const {exampleData}=await import('./example.js');const {unproject}=await import('./engine.js');const d=exampleData();for(const n of d.raw.elements)if(n.type==='node')n.tags={...n.tags,ele:20+(n.lat-40.78)*100};return JSON.stringify({...d,schema:'cp-snapshot-1',a:unproject(d.a),b:unproject(d.b),manifest:{mode:'controlled-test-fixture'}});}''')
 page.locator('#import').set_input_files({'name':'terrain-test.json','mimeType':'application/json','buffer':snapshot.encode()})
 page.wait_for_function("document.querySelector('#warnings').textContent.includes('Terrain ascent:')")
 assert page.locator('#elevationProfile path').count()==1
 assert not re.search('[가-힣]',page.locator('body').inner_text())
 page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert not errors,errors
 print('PASS: English UI, example routing, missing-terrain disclosure, playback, model explanation, mobile, snapshot terrain route and elevation profile; PNG terrain decoding, 30 m densification, nonmutating enrichment with controlled DEM fixture')
 b.close()
