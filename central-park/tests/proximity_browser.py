"""Run with the repository served at 127.0.0.1:8000. All fixtures are synthetic."""
import json,zipfile
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1440,'height':1000})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.add_init_script('''const Native=window.Worker;window.routeRequests=0;window.Worker=class extends Native{postMessage(m,...a){if(m.type==='route')window.routeRequests++;super.postMessage(m,...a);}};''')
    page.route('https://**/*',lambda r:r.abort())
    page.goto('http://127.0.0.1:8000/central-park/dist/')
    snapshot=page.evaluate('''async()=>{
      const {project,unproject}=await import('./engine.js');const o=project([-73.97,40.78]),p=x=>[o[0]+x,o[1]],ll=x=>unproject(p(x));
      const elements=Array.from({length:11},(_,i)=>({type:'node',id:i+1,lon:ll(i*80)[0],lat:ll(i*80)[1],tags:{ele:20}}));
      for(const [id,x] of [[99,2000],[100,2080]])elements.push({type:'node',id,lon:ll(x)[0],lat:ll(x)[1],tags:{ele:20}});
      elements.push({type:'way',id:1000,nodes:Array.from({length:11},(_,i)=>i+1),tags:{highway:'residential',bicycle:'yes',name:'Fixture street'}});
      elements.push({type:'way',id:1001,nodes:[99,100],tags:{highway:'footway'}});
      const station=(id,x,extra={})=>({id,name:id,p:p(x),lon:ll(x)[0],lat:ll(x)[1],installed:true,renting:true,returning:true,ebikes:2,docks:0,timestamp:Date.now()/1000,...extra});
      const stations=[station('near-empty',160,{ebikes:0}),station('four-minutes',320),station('seven-minutes',560),station('return-dock',720,{ebikes:0,docks:3}),station('unknown',240,{installed:null,ebikes:null,docks:null}),station('disconnected',2000,{docks:2})];
      const ring=[[-500,-500],[1500,-500],[1500,500],[-500,500],[-500,-500]].map(([x,y])=>unproject([o[0]+x,o[1]+y]));
      return JSON.stringify({schema:'cp-snapshot-1',geometry:{type:'Polygon',coordinates:[ring]},raw:{elements},stations,a:ll(0),b:ll(800),manifest:{mode:'controlled-proximity-fixture'}});
    }''')
    def load(data):
        page.locator('#import').set_input_files({'name':'proximity-fixture.json','mimeType':'application/json','buffer':data.encode()})
        page.wait_for_function("document.querySelector('#facilityQuality').textContent.startsWith('REPLAY_SNAPSHOT')")
    def ready():
        page.wait_for_function("document.querySelector('#facilityRows').children.length>0 && !document.querySelector('#calculate').disabled")
    def counters():
        return page.locator('#facilityPanel').evaluate('e=>[e.dataset.routeSearchBuilds,e.dataset.proximitySearchBuilds]')
    def paths():return page.locator('[data-route-agent=human]').evaluate_all("es=>es.map(e=>e.getAttribute('d'))")
    def state(sid):return page.locator('[data-station="'+sid+'"]').get_attribute('data-facility-state')
    def change(sid,value):
        page.locator('#'+sid).fill(value);page.locator('#'+sid).press('Tab');ready()
    load(snapshot);ready()
    assert state('near-empty')=='NEAR_UNAVAILABLE'
    assert state('four-minutes')=='NEAR_AVAILABLE'
    assert state('seven-minutes')=='FAR_AVAILABLE'
    assert state('unknown')=='UNKNOWN' and state('disconnected')=='DISCONNECTED'
    assert 'not live availability' in page.locator('#facilityQuality').inner_text()
    assert 'four-minutes' in page.locator('#facilityNearest').inner_text()
    assert page.locator('#facilityComparison tr').count()==2
    assert 'Direct walking' in page.locator('#facilityComparison').inner_text()
    coords=[page.locator('#coordA').input_value(),page.locator('#coordB').input_value()]
    page.locator('[data-station=near-empty]').click()
    assert 'No available e-bike' in page.locator('#facilityInspector').inner_text()
    assert coords==[page.locator('#coordA').input_value(),page.locator('#coordB').input_value()]
    original=paths();usd=page.locator('#usd').inner_text();cache=counters()
    change('walkThresholdMin','10')
    assert state('seven-minutes')=='NEAR_AVAILABLE'
    assert paths()==original and page.locator('#usd').inner_text()==usd
    assert counters()==cache, 'Threshold caused graph search instead of reclassification'
    page.locator('#settings').evaluate('e=>e.open=true')
    kcal=float(page.locator('#kcal').inner_text());change('mass','100')
    assert float(page.locator('#kcal').inner_text())>kcal
    assert paths()==original and page.locator('#usd').inner_text()==usd and counters()==cache
    change('walkMet','4')
    assert paths()==original and page.locator('#usd').inner_text()==usd and counters()==cache
    page.locator('#profile').select_option('annual');ready()
    assert paths()==original and counters()==cache
    assert float(page.locator('#usd').inner_text())<float(usd)
    requests=page.evaluate('routeRequests')
    for control,target in [('layerBaseline','mapBaseline'),('layerReach','mapReachability')]:
        page.locator('#'+control).check();assert page.locator('#'+target).evaluate("e=>getComputedStyle(e).display")!='none'
    assert page.locator('#mapReachability path[data-minutes="3"]').count()==2
    page.locator('#layerStations').uncheck();assert page.locator('#mapStations').evaluate("e=>getComputedStyle(e).display")=='none'
    page.locator('#layerStations').check()
    assert page.evaluate('routeRequests')==requests
    # Supported UI limit 10 does not prune this fixture. Add duplicate valid
    # stations to force a real pruning warning, then select All.
    many=json.loads(snapshot)
    for i in range(12):many['stations'].append({**many['stations'][1],'id':'extra-'+str(i),'name':'Extra '+str(i)})
    load(json.dumps(many));ready()
    assert page.locator('#candidateWarning').is_visible()
    page.locator('#maxStationCandidates').select_option('0');ready()
    assert page.locator('#candidateWarning').is_hidden()
    page.locator('#facilityRole').select_option('destination')
    assert 'dropoff' in page.locator('#facilityInspector').inner_text()
    # Export includes the new settings, analysis, raw status, baseline and CSV.
    with page.expect_download() as download:page.locator('#export').click()
    with zipfile.ZipFile(download.value.path()) as z:
        output=json.loads(z.read('result.json'))
        assert output['result']['proximity']['settings']['walk_threshold_min']==10
        assert output['result']['proximity']['data_quality']=='REPLAY_SNAPSHOT'
        assert output['result']['trip']['route_status']=='FEASIBLE'
        assert 'NEAR_UNAVAILABLE' in z.read('proximity.csv').decode()
        assert json.loads(z.read('comparison.json'))['baseline']['mode']=='DIRECT_WALKING'
        assert json.loads(z.read('snapshot.json'))['settings']['maxStationCandidates']==0
    page.locator('#facilityPanel').screenshot(path='/tmp/central-park-proximity.png')
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    # Missing flags/counts must not be converted into a zero or a live claim.
    missing=json.loads(snapshot)
    for s in missing['stations']:
        s['installed']=None;s['ebikes']=None;s['docks']=None
    load(json.dumps(missing));ready()
    assert 'NO_FEASIBLE_CITIBIKE_ROUTE' in page.locator('#facilityComparison').inner_text()
    assert page.locator('#facilityRows').inner_text().count('STATUS_UNKNOWN')>=5
    assert page.locator('#kcal').inner_text()=='—'
    assert 'Direct walking' in page.locator('#facilityComparison').inner_text()
    # A failed status refresh flag remains UNKNOWN even if old counts are positive.
    failed=json.loads(snapshot)
    for s in failed['stations']:
        s['status_present']=False;s['status_error']='Controlled refresh outage'
    load(json.dumps(failed));ready()
    assert 'NO_FEASIBLE_CITIBIKE_ROUTE' in page.locator('#facilityComparison').inner_text()
    assert page.locator('[data-station=four-minutes]').get_attribute('data-facility-state')=='UNKNOWN'
    assert not errors,errors
    print('PASS: facility statuses/inspector, threshold vs hard caps, nearest/baseline, cache for threshold/weight/plan, layers, pruning/All, CSV/JSON/snapshot, missing status, mobile')
    browser.close()
