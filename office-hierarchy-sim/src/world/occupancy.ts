export class WCManager {
  occupants=new Set<string>(); reservations=new Map<string,{at:number;slot:number}>(); slots=new Map<string,number>();
  successes=0; attempts=0; full=0; occupiedTime=0;
  constructor(public capacity=4) {}
  tryReserve(id:string,now:number): boolean {
    if(this.occupants.has(id)||this.reservations.has(id))return true;
    this.attempts++;if(this.occupants.size+this.reservations.size>=this.capacity){this.full++;return false;}
    let slot=0;while([...this.slots.values()].includes(slot))slot++;
    this.reservations.set(id,{at:now,slot});this.slots.set(id,slot);this.successes++;return true;
  }
  enter(id:string): boolean { if(!this.reservations.has(id))return false;this.reservations.delete(id);this.occupants.add(id);return true; }
  exitOrCancel(id:string) { this.occupants.delete(id);this.reservations.delete(id);this.slots.delete(id); }
}
