import test from 'node:test';
import assert from 'node:assert/strict';
import {PEOPLE,OBSTACLES,RADIUS,CLEARANCE,validPoint,validSegment,findRoute} from '../model.mjs';

test('six persistent identities have the correct roles and valid initial locations',()=>{
  assert.deepEqual(PEOPLE.map(p=>p.id),['A','B','C','D','E','F']);
  PEOPLE.forEach((p,i)=>{
    assert.equal(p.role,i<3?'office_worker':'tourist');assert.ok(validPoint(p));
  });
  assert.equal(new Set(PEOPLE.map(p=>`${p.x},${p.z}`)).size,6);
});
test('100m boundary accounts for person clearance in every direction',()=>{
  for(let angle=0;angle<Math.PI*2;angle+=.1){
    assert.equal(validPoint({x:101*Math.cos(angle),z:101*Math.sin(angle)}),false);
    assert.equal(validPoint({x:99*Math.cos(angle),z:99*Math.sin(angle)}),false);
  }
  assert.equal(validPoint({x:0,z:RADIUS-CLEARANCE}),true);
  assert.equal(validPoint({x:NaN,z:0}),false);
});
test('buildings, benches, and tree trunks reject destinations',()=>{
  for(const obstacle of OBSTACLES)assert.equal(validPoint(obstacle),false);
  assert.equal(findRoute(PEOPLE[0],{x:110,z:0}),null);
  assert.equal(findRoute(PEOPLE[0],OBSTACLES[0]),null);
});
test('route detours around a building, and every segment is traversable',()=>{
  const start={x:-70,z:-35},end={x:-15,z:-35};
  assert.equal(validSegment(start,end),false);
  const route=findRoute(start,end);assert.ok(route);assert.ok(route.length>1);
  let previous=start;
  for(const point of route){assert.ok(validPoint(point));assert.ok(validSegment(previous,point));previous=point;}
  assert.deepEqual(route.at(-1),end);
});
test('all six people can route to representative destinations',()=>{
  for(const person of PEOPLE)for(const end of [{x:0,z:0},{x:60,z:0},{x:-72,z:15},{x:0,z:85}]){
    const route=findRoute(person,end);assert.ok(route,`${person.id} to ${JSON.stringify(end)}`);
    let previous=person;
    for(const point of route){assert.ok(validSegment(previous,point));previous=point;}
    assert.deepEqual(route.at(-1),end);
  }
});
