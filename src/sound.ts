let context:AudioContext|undefined;
export function playFeedback(kind:string,enabled:boolean){
  if(!enabled)return;
  try{context??=new AudioContext();void context.resume();const notes=kind==='snack'?[440,660,880]:kind==='cheer'||kind==='fountain'?[523,659,784,1046]:kind==='arcade'?[330,440,660,880]:[480,640];notes.forEach((freq,i)=>{const osc=context!.createOscillator(),gain=context!.createGain(),at=context!.currentTime+i*.075;osc.type='sine';osc.frequency.setValueAtTime(freq,at);gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.045,at+.012);gain.gain.exponentialRampToValueAtTime(.001,at+.16);osc.connect(gain);gain.connect(context!.destination);osc.start(at);osc.stop(at+.18);});}catch{/* Audio is optional; the visual interaction always completes. */}
}
