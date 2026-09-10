'use strict';

const assert=require('node:assert/strict');
const admin=require('firebase-admin');

if(!process.env.FIRESTORE_EMULATOR_HOST)throw new Error('This integration test must run against the Firestore emulator.');
const app=admin.initializeApp({projectId:process.env.GCLOUD_PROJECT||'mopyonlakay'},`simulation-integration-${Date.now()}`);
const db=app.firestore();
const FieldValue=admin.firestore.FieldValue;

const delay=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
async function waitFor(read,predicate,label,timeout=120000){
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){const value=await read();if(predicate(value))return value;await delay(500);}
  throw new Error(`Timed out waiting for ${label}`);
}

async function runChampionship(game){
  const suffix=`${game}-${Date.now().toString(36)}`,championshipId=`integration-${suffix}`,simulationRunId=`run-${suffix}`;
  const championshipRef=db.collection('championships').doc(championshipId);
  const participants=Array.from({length:32},(_,index)=>({uid:`${suffix}-bot-${index+1}`,displayName:`Bot ${index+1}`,username:`bot.${index+1}`,seed:index+1,real:false}));
  await championshipRef.set({game,number:`INT-${game}`,entryFee:125,prize:2000,maxPlayers:32,rounds:5,status:'registration-open',registeredCount:31,participants:participants.slice(0,31),simulation:true,simulationRunId,botAutomationEnabled:true,startAt:admin.firestore.Timestamp.fromMillis(Date.now()+3600000),createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
  let batch=db.batch();
  participants.slice(0,31).forEach(player=>batch.set(championshipRef.collection('registrations').doc(player.uid),{uid:player.uid,displayName:player.displayName,username:player.username,seed:player.seed,real:false,registeredAt:FieldValue.serverTimestamp()}));
  await batch.commit();
  await championshipRef.update({registeredCount:32,participants,updatedAt:FieldValue.serverTimestamp()});
  await championshipRef.collection('registrations').doc(participants[31].uid).set({...participants[31],registeredAt:FieldValue.serverTimestamp()});
  await waitFor(()=>championshipRef.get(),snapshot=>snapshot.data()?.currentRound==='16e',`${game} automatic bracket`);
  const firstRound=await waitFor(()=>db.collection('matches').where('championshipId','==',championshipId).get(),snapshot=>snapshot.docs.filter(doc=>doc.data()?.kind==='series'&&doc.data()?.round==='16e').length===16,`${game} first round series`);
  batch=db.batch();
  firstRound.docs.filter(doc=>doc.data()?.kind==='series'&&doc.data()?.round==='16e').forEach((document,index)=>batch.set(db.collection('simulationBotJobs').doc(document.id),{championshipId,simulationRunId,seriesId:document.id,round:'16e',game,status:'queued',seed:`${suffix}-seed-${index}`,queueGeneration:1,attempt:1,progress:{completedGames:0,targetWins:2},engineVersion:'integration-test',queuedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()}));
  await batch.commit();
  await waitFor(()=>championshipRef.get(),snapshot=>snapshot.data()?.status==='completed',`${game} championship completion`,180000);
  const [matches,result,rewards,leaderboard,coupons]=await Promise.all([
    db.collection('matches').where('championshipId','==',championshipId).get(),
    db.collection('results').doc(`${championshipId}-result`).get(),
    db.collection('playerRewardEvents').where('championshipId','==',championshipId).get(),
    db.collection('leaderboard').get(),
    db.collection('jwetproCoupons').get()
  ]);
  const series=matches.docs.filter(doc=>doc.data()?.kind==='series'),games=matches.docs.filter(doc=>doc.data()?.kind==='game');
  assert.equal(series.length,31);
  assert.ok(series.every(doc=>doc.data()?.status==='completed'&&doc.data()?.winnerUid));
  assert.ok(games.length>=62);
  assert.equal(result.exists,true);
  assert.equal(rewards.size,31);
  assert.ok(participants.every(player=>leaderboard.docs.some(doc=>doc.id===player.uid)));
  assert.equal(coupons.docs.filter(doc=>doc.data()?.sourceChampionshipId===championshipId).length,0);
  console.log(`${game}: ${series.length} series, ${games.length} games, champion ${result.data().winnerName}`);
}

(async()=>{
  await runChampionship('mopyon');
  await runChampionship('domino');
  await app.delete();
})().catch(async error=>{console.error(error);await app.delete();process.exitCode=1;});
